import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { MediaInfo, ClientCapabilities } from './mediaInfo.service.js';
import {
  getTranscodeSettings,
  normalizeAudioCodec,
  normalizeVideoCodec,
} from './mediaInfo.service.js';

export interface TranscodeJob {
  id: string;
  mediaId: string; // movie or episode ID
  mediaType: 'movie' | 'episode';
  inputPath: string;
  outputDir: string;
  settings: ReturnType<typeof getTranscodeSettings>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  process?: ReturnType<typeof spawn>;
  /** Segment container: fMP4 is required for HEVC to play back via hls.js. */
  segmentType: 'ts' | 'fmp4';
  /** Highest segment index the client has actually asked for so far. */
  lastRequestedSegment: number;
  /** How far into the media ffmpeg has encoded, in seconds (from its stderr). */
  encodedSeconds: number;
  /** True while the ffmpeg process is SIGSTOPped by the throttler. */
  throttled: boolean;
}

/** Segment length in seconds. Also the unit the throttler reasons in. */
const SEGMENT_DURATION = 4;

/**
 * How far ahead of the client's playback position ffmpeg is allowed to get
 * before it's paused, and the point at which it's resumed.
 *
 * Without this ffmpeg races to convert the *entire* file at maximum speed
 * the moment playback starts: a 2-hour movie pegs every core (and, on a
 * NAS with spinning disks, saturates disk I/O) for minutes, which is
 * exactly what makes playback stutter while it runs. Plex and Jellyfin
 * both throttle for the same reason — there's no point having 90 minutes
 * of a movie transcoded ahead of a viewer who is 30 seconds in, and if
 * they stop watching it was all wasted anyway.
 */
const THROTTLE_AHEAD_SECONDS = 180;
const THROTTLE_RESUME_SECONDS = 120;

// In-memory store for active transcode jobs
const activeJobs = new Map<string, TranscodeJob>();

/**
 * Generate unique transcode job ID
 */
function generateJobId(mediaId: string): string {
  return `transcode_${mediaId}_${Date.now()}`;
}

/**
 * Get or create transcode directory
 */
export function getTranscodeDirectory(): string {
  const dir = join(env.dataDir, 'transcodes');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Find the most recent transcode job for this media regardless of status
 * (including already-completed ones), keyed off the timestamp embedded in
 * the job ID (`transcode_<mediaId>_<Date.now()>`).
 *
 * Used by the segment-serving route, which previously re-derived the job's
 * output directory on every single segment request by scanning the entire
 * transcode directory for a name starting with `transcode_<mediaId>_`
 * (`readdir()` + `Array.find()`, once per ~6-second segment for the whole
 * playback session). That's needlessly slow — worse as more old job
 * directories accumulate — and, if more than one directory happened to
 * match the prefix (e.g. a previous, not-yet-cleaned-up run for the same
 * media), ambiguous about which one is actually current. Looking the job
 * up directly by mediaId is both faster and unambiguous.
 */
export function findJobForMedia(mediaId: string): TranscodeJob | undefined {
  let best: TranscodeJob | undefined;
  let bestTime = -1;
  for (const job of activeJobs.values()) {
    if (job.mediaId !== mediaId) continue;
    const time = parseInt(job.id.split('_').pop() || '0', 10);
    if (time > bestTime) {
      bestTime = time;
      best = job;
    }
  }
  return best;
}

export interface TranscodePlan {
  /** Copy the video stream untouched instead of re-encoding it. */
  copyVideo: boolean;
  /** Copy the audio stream untouched instead of re-encoding it. */
  copyAudio: boolean;
  /** Segment container to emit. */
  segmentType: 'ts' | 'fmp4';
}

/** Audio codecs MPEG-TS can actually carry. fMP4 is far more permissive. */
const TS_AUDIO_CODECS = new Set(['aac', 'mp3', 'ac3', 'eac3']);

/**
 * Decide how to package a stream for a given client: what can be copied
 * (remuxed) untouched, and which segment container to use.
 *
 * Copying rather than re-encoding is the whole ballgame for CPU usage —
 * it's the difference between "repackage the file", which is nearly free,
 * and "decode and re-encode every frame", which is what actually pegs a
 * CPU. The common browser case is an MKV whose *streams* are perfectly
 * playable and only the container isn't; that should cost almost nothing,
 * and is what other media servers call "direct stream".
 */
export function planTranscode(mediaInfo: MediaInfo, clientCaps: ClientCapabilities): TranscodePlan {
  const srcVideoCodec = mediaInfo.video ? normalizeVideoCodec(mediaInfo.video.codec) : '';
  const copyVideo = !!srcVideoCodec && clientCaps.videoCodecs.includes(srcVideoCodec);

  // HEVC has to be delivered in fMP4 segments — hls.js can't play HEVC out
  // of MPEG-TS, so copying an HEVC stream into .ts segments produces a
  // playlist the browser loads and then can't decode. This (not the codec
  // itself) is the likeliest reason a copied HEVC stream previously failed
  // with a bare "could not be decoded" in a browser that does support HEVC.
  const segmentType: 'ts' | 'fmp4' = copyVideo && srcVideoCodec === 'hevc' ? 'fmp4' : 'ts';

  const defaultAudio = mediaInfo.audio.find((a) => a.default) || mediaInfo.audio[0];
  const srcAudioCodec = defaultAudio ? normalizeAudioCodec(defaultAudio.codec) : '';
  // Audio used to be re-encoded to AAC unconditionally, even when the
  // source track was already AAC/MP3/Opus/FLAC and the client had just told
  // us it can decode it. The container still constrains this though: FLAC
  // and Opus, for instance, have no standard MPEG-TS mapping, so copying
  // one of those into .ts segments would just make ffmpeg fail.
  const audioFitsContainer = segmentType === 'fmp4' || TS_AUDIO_CODECS.has(srcAudioCodec);
  const copyAudio =
    !!srcAudioCodec && clientCaps.audioCodecs.includes(srcAudioCodec) && audioFitsContainer;

  return { copyVideo, copyAudio, segmentType };
}

/**
 * Start a new transcode job for HLS streaming, reusing an already
 * in-progress one for the same media if there is one.
 */
export async function startHlsTranscode(
  mediaId: string,
  mediaType: 'movie' | 'episode',
  inputPath: string,
  mediaInfo: MediaInfo,
  clientCaps: ClientCapabilities,
): Promise<TranscodeJob> {
  // Reuse an already pending/processing/completed job for this media rather
  // than always starting a fresh ffmpeg process — covers both the retry
  // scenario above and a plain page reload after the transcode already
  // finished (which otherwise re-transcoded the whole thing from scratch
  // for no reason). Only a 'failed' job is not reused — that should retry
  // clean.
  const existing = findJobForMedia(mediaId);
  if (existing && existing.status !== 'failed') {
    logger.debug(
      `Reusing existing transcode job ${existing.id} (status=${existing.status}) for media ${mediaId}`,
    );
    return existing;
  }

  const jobId = generateJobId(mediaId);
  const outputDir = join(getTranscodeDirectory(), jobId);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const settings = getTranscodeSettings(mediaInfo, clientCaps);
  const { copyVideo, copyAudio, segmentType } = planTranscode(mediaInfo, clientCaps);

  const job: TranscodeJob = {
    id: jobId,
    mediaId,
    mediaType,
    inputPath,
    outputDir,
    settings,
    status: 'pending',
    progress: 0,
    segmentType,
    lastRequestedSegment: 0,
    encodedSeconds: 0,
    throttled: false,
  };

  activeJobs.set(jobId, job);

  // Start transcoding in background
  startTranscodingProcess(job, mediaInfo, copyVideo, copyAudio);

  logger.info(
    `Started HLS transcode job ${jobId} for ${mediaType} ${mediaId} ` +
      `(copyVideo=${copyVideo}, copyAudio=${copyAudio}, segments=${segmentType})`,
  );
  return job;
}

/**
 * Start FFmpeg process for HLS transcoding
 */
function startTranscodingProcess(
  job: TranscodeJob,
  mediaInfo: MediaInfo,
  copyVideo = false,
  copyAudio = false,
): void {
  job.status = 'processing';

  const outputPath = join(job.outputDir, 'playlist.m3u8');
  const ext = job.segmentType === 'fmp4' ? 'm4s' : 'ts';
  const segmentPath = join(job.outputDir, `segment_%03d.${ext}`);

  // Build FFmpeg arguments
  const args = buildFfmpegArgs(
    job.inputPath,
    outputPath,
    segmentPath,
    job.settings,
    mediaInfo,
    copyVideo,
    copyAudio,
    job.segmentType,
  );

  logger.debug(`FFmpeg command: ffmpeg ${args.join(' ')}`);

  const ffmpeg = spawn('ffmpeg', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  job.process = ffmpeg;

  // Parse progress from stderr
  const duration = mediaInfo.duration || 0;

  ffmpeg.stderr.on('data', (data) => {
    const output = data.toString();

    // Parse progress: time=00:05:23.45
    const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const seconds = parseFloat(timeMatch[3]);
      const currentTime = hours * 3600 + minutes * 60 + seconds;
      job.encodedSeconds = currentTime;
      if (duration > 0) {
        job.progress = Math.min(100, Math.round((currentTime / duration) * 100));
      }
      maybeThrottle(job);
    }

    // Check for errors
    if (output.includes('Error') || output.includes('error')) {
      logger.warn(`FFmpeg output: ${output.trim()}`);
    }
  });

  ffmpeg.on('close', (code) => {
    if (code === 0) {
      job.status = 'completed';
      job.progress = 100;
      logger.info(`Transcode job ${job.id} completed`);
    } else {
      job.status = 'failed';
      job.error = `FFmpeg exited with code ${code}`;
      logger.error(`Transcode job ${job.id} failed with code ${code}`);
    }

    // Clean up process reference
    job.process = undefined;
  });

  ffmpeg.on('error', (err) => {
    job.status = 'failed';
    job.error = err.message;
    logger.error(`Transcode job ${job.id} error:`, err);
    job.process = undefined;
  });
}

/**
 * Pause ffmpeg (SIGSTOP) once it's far enough ahead of what the client has
 * actually played. Resumed by noteSegmentRequested() as the client catches
 * up. See THROTTLE_AHEAD_SECONDS for why this exists.
 */
function maybeThrottle(job: TranscodeJob): void {
  if (job.throttled || !job.process) return;
  const clientPos = job.lastRequestedSegment * SEGMENT_DURATION;
  if (job.encodedSeconds - clientPos > THROTTLE_AHEAD_SECONDS) {
    job.process.kill('SIGSTOP');
    job.throttled = true;
    logger.debug(
      `Throttled transcode ${job.id} (encoded ${Math.round(job.encodedSeconds)}s, ` +
        `client at ${Math.round(clientPos)}s)`,
    );
  }
}

/**
 * Record that the client requested a given segment, resuming a throttled
 * ffmpeg process when playback has caught up far enough to need more.
 */
export function noteSegmentRequested(mediaId: string, segmentNum: number): void {
  const job = findJobForMedia(mediaId);
  if (!job) return;

  if (segmentNum > job.lastRequestedSegment) {
    job.lastRequestedSegment = segmentNum;
  }

  if (!job.throttled || !job.process) return;
  const clientPos = job.lastRequestedSegment * SEGMENT_DURATION;
  if (job.encodedSeconds - clientPos < THROTTLE_RESUME_SECONDS) {
    job.process.kill('SIGCONT');
    job.throttled = false;
    logger.debug(`Resumed transcode ${job.id} (client at ${Math.round(clientPos)}s)`);
  }
}

/**
 * Build FFmpeg arguments for HLS transcoding
 */
function buildFfmpegArgs(
  input: string,
  output: string,
  segmentPattern: string,
  settings: ReturnType<typeof getTranscodeSettings>,
  mediaInfo: MediaInfo,
  copyVideo = false,
  copyAudio = false,
  segmentType: 'ts' | 'fmp4' = 'ts',
): string[] {
  const args: string[] = [
    '-hide_banner',
    '-y', // Overwrite output files
    '-i',
    input,
  ];

  if (copyVideo) {
    // Video is already browser-compatible — copy the stream directly.
    // Avoids re-encoding entirely: faster start, no quality loss.
    args.push('-c:v', 'copy');
  } else {
    // Video codec settings
    const videoCodec = settings.videoCodec === 'hevc' ? 'libx265' : 'libx264';
    // 'veryfast' was too slow for real-world hardware to produce even the
    // *first* HLS segment within the client/server wait windows: a live
    // log showed a copyVideo=false (real re-encode) job for one movie still
    // running well past the point where a *different*, later-started
    // copyVideo=true job for another movie had already finished
    // completely. 'ultrafast' trades some compression efficiency (bigger
    // segments at the same bitrate target) for substantially faster
    // encoding — the right tradeoff here, since a stream nobody can start
    // watching is worse than a slightly larger one.
    const preset = 'ultrafast';
    args.push(
      '-c:v',
      videoCodec,
      '-preset',
      preset,
      '-b:v',
      settings.videoBitrate.toString(),
      '-maxrate',
      Math.round(settings.videoBitrate * 1.5).toString(),
      '-bufsize',
      Math.round(settings.videoBitrate * 2).toString(),
      '-s',
      `${settings.maxResolution.width}x${settings.maxResolution.height}`,
      '-pix_fmt',
      'yuv420p', // For browser compatibility
      '-g',
      '48', // GOP size for HLS
      '-keyint_min',
      '48',
      '-sc_threshold',
      '0',
    );
  }

  // Audio codec settings
  if (copyAudio) {
    // Source audio is something the client already decodes — remux it
    // untouched instead of burning CPU re-encoding it to the same thing.
    args.push('-c:a', 'copy');
  } else {
    args.push(
      '-c:a',
      settings.audioCodec === 'opus' ? 'libopus' : 'aac',
      '-b:a',
      settings.audioBitrate.toString(),
      '-ar',
      '48000',
    );
  }

  // Map video first, then the chosen audio stream — players (and hls.js in
  // particular) expect video to be stream 0 of the output.
  args.push('-map', '0:v:0');

  // Select best audio stream (prefer default, then highest quality)
  if (mediaInfo.audio.length > 0) {
    const defaultAudio = mediaInfo.audio.find((a) => a.default) || mediaInfo.audio[0];
    args.push('-map', `0:a:${mediaInfo.audio.indexOf(defaultAudio)}`);
  }

  // HLS settings
  args.push(
    '-f',
    'hls',
    '-hls_time',
    String(SEGMENT_DURATION),
    '-hls_list_size',
    '0', // Keep all segments
    '-hls_segment_filename',
    segmentPattern,
    // "vod" tells ffmpeg's HLS muxer to buffer the *entire* segment list and
    // only write playlist.m3u8 once, at the very end of encoding — so the
    // "wait up to 30s for the playlist to appear" logic in the
    // /hls/.../playlist.m3u8 route could never succeed for anything but the
    // shortest clips; a live repro showed a job take ~4 minutes to
    // "complete" (even in copyVideo fast-path mode) with no playlist file
    // visible at any point before that. "event" makes ffmpeg write/update
    // the playlist incrementally as each segment finishes (appending
    // #EXT-X-ENDLIST once done), which is what "start playback as soon as
    // a few segments exist" actually needs — hls.js handles EVENT
    // playlists the same as VOD ones once ENDLIST appears.
    '-hls_playlist_type',
    'event',
    '-start_number',
    '0',
  );

  if (segmentType === 'fmp4') {
    // hls.js cannot play HEVC out of MPEG-TS; fMP4 (CMAF) segments are the
    // only way to deliver a copied HEVC stream it will actually decode.
    args.push('-hls_segment_type', 'fmp4', '-hls_fmp4_init_filename', 'init.mp4');
  }

  // Output
  args.push(output);

  return args;
}

/**
 * Get transcode job status
 */
export function getTranscodeJob(jobId: string): TranscodeJob | undefined {
  return activeJobs.get(jobId);
}

/**
 * Get HLS playlist path for a job
 */
export function getHlsPlaylistPath(jobId: string): string | null {
  const job = activeJobs.get(jobId);
  if (!job) return null;
  return join(job.outputDir, 'playlist.m3u8');
}

/**
 * Cancel a running transcode job
 */
export function cancelTranscodeJob(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (!job || !job.process) return false;

  // Continue a throttled process first — SIGTERM isn't acted on while stopped.
  if (job.throttled) job.process.kill('SIGCONT');
  job.process.kill('SIGTERM');
  job.status = 'failed';
  job.error = 'Cancelled by user';

  logger.info(`Cancelled transcode job ${jobId}`);
  return true;
}

/**
 * Clean up old transcode output directories.
 *
 * This scans the transcode directory on disk directly rather than only the
 * in-memory `activeJobs` map, because that map is empty after every server
 * restart — without a disk-level pass, HLS segment/playlist files from any
 * job that was still around at restart time would never be removed and
 * would accumulate on disk indefinitely.
 *
 * A directory is only removed once its embedded timestamp is older than
 * `maxAgeHours` AND it isn't tracked as a currently pending/processing job
 * (never delete out from under an active transcode).
 */
export async function cleanupOldTranscodes(maxAgeHours: number = 24): Promise<void> {
  const dir = getTranscodeDirectory();
  const now = Date.now();
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    logger.warn('Failed to read transcode directory during cleanup', { error });
    return;
  }

  for (const jobId of entries) {
    if (!jobId.startsWith('transcode_')) continue;

    const job = activeJobs.get(jobId);
    if (job && (job.status === 'pending' || job.status === 'processing')) {
      continue; // still transcoding — never touch its files
    }

    const jobTime = parseInt(jobId.split('_').pop() || '0', 10);
    // No parseable timestamp (unexpected folder name) is treated as stale
    // rather than kept forever.
    const age = jobTime > 0 ? now - jobTime : Infinity;
    if (age <= maxAgeMs) continue;

    try {
      await rm(join(dir, jobId), { recursive: true, force: true });
      activeJobs.delete(jobId);
      logger.info(`Cleaned up old transcode output: ${jobId}`);
    } catch (error) {
      logger.warn(`Failed to remove old transcode directory ${jobId}`, { error });
    }
  }
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic transcode-cleanup job: runs once immediately (to catch
 * anything orphaned by a crash/restart) and then on a fixed interval.
 */
export function startTranscodeCleanupScheduler(
  intervalHours: number = 6,
  maxAgeHours: number = 24,
): void {
  const run = () => {
    cleanupOldTranscodes(maxAgeHours).catch((error) =>
      logger.error('Transcode cleanup run failed', { error }),
    );
  };

  run();
  cleanupTimer = setInterval(run, intervalHours * 60 * 60 * 1000);
  logger.info(
    `[TranscodeCleanup] Started (every ${intervalHours}h, removing output older than ${maxAgeHours}h)`,
  );
}

export function stopTranscodeCleanupScheduler(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    logger.info('[TranscodeCleanup] Stopped');
  }
}

/**
 * Kill every ffmpeg process still running for an active job. Called on
 * graceful server shutdown so transcodes don't turn into orphaned processes
 * that keep writing to a directory nothing tracks anymore.
 */
export function killAllActiveTranscodes(): void {
  for (const job of activeJobs.values()) {
    if (job.process) {
      // A SIGSTOPped process doesn't act on SIGTERM until it's running
      // again, so throttled jobs must be continued first or they'd survive
      // as orphans.
      if (job.throttled) job.process.kill('SIGCONT');
      job.process.kill('SIGTERM');
    }
  }
}

/**
 * Check if media needs transcoding for client
 */
export async function checkTranscodeNeeded(
  mediaId: string,
  mediaType: 'movie' | 'episode',
  filePath: string,
  clientCaps: ClientCapabilities,
): Promise<{
  directPlay: boolean;
  transcodeJob?: TranscodeJob;
  reason?: string;
}> {
  const { probeMedia, canDirectPlay } = await import('./mediaInfo.service.js');

  const mediaInfo = await probeMedia(filePath);
  if (!mediaInfo) {
    return { directPlay: false, reason: 'Failed to probe media' };
  }

  const directPlayCheck = canDirectPlay(mediaInfo, clientCaps);

  if (directPlayCheck.playable) {
    return { directPlay: true };
  }

  // Start transcode
  const job = await startHlsTranscode(mediaId, mediaType, filePath, mediaInfo, clientCaps);

  return {
    directPlay: false,
    transcodeJob: job,
    reason: directPlayCheck.reason,
  };
}
