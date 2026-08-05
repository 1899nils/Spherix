import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { MediaInfo, ClientCapabilities } from './mediaInfo.service.js';
import { getTranscodeSettings } from './mediaInfo.service.js';

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
}

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

  // If the video codec is already browser-compatible, copy it instead of
  // re-encoding. This is much faster and avoids quality loss.
  // Typical case: MKV with h264 video + DTS audio → copy video, transcode audio only.
  const VIDEO_COMPAT: Record<string, string> = {
    h264: 'h264',
    avc: 'h264',
    avc1: 'h264',
    hevc: 'hevc',
    h265: 'hevc',
    vp9: 'vp9',
    vp09: 'vp9',
    av1: 'av1',
    av01: 'av1',
  };
  const srcVideoCodec = VIDEO_COMPAT[mediaInfo.video?.codec?.toLowerCase() ?? ''] ?? '';
  const copyVideo =
    !!mediaInfo.video && !!srcVideoCodec && clientCaps.videoCodecs.includes(srcVideoCodec);

  const job: TranscodeJob = {
    id: jobId,
    mediaId,
    mediaType,
    inputPath,
    outputDir,
    settings,
    status: 'pending',
    progress: 0,
  };

  activeJobs.set(jobId, job);

  // Start transcoding in background
  startTranscodingProcess(job, mediaInfo, copyVideo);

  logger.info(
    `Started HLS transcode job ${jobId} for ${mediaType} ${mediaId} (copyVideo=${copyVideo})`,
  );
  return job;
}

/**
 * Start FFmpeg process for HLS transcoding
 */
function startTranscodingProcess(job: TranscodeJob, mediaInfo: MediaInfo, copyVideo = false): void {
  job.status = 'processing';

  const outputPath = join(job.outputDir, 'playlist.m3u8');
  const segmentPath = join(job.outputDir, 'segment_%03d.ts');

  // Build FFmpeg arguments
  const args = buildFfmpegArgs(
    job.inputPath,
    outputPath,
    segmentPath,
    job.settings,
    mediaInfo,
    copyVideo,
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
    if (timeMatch && duration > 0) {
      const hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]);
      const seconds = parseFloat(timeMatch[3]);
      const currentTime = hours * 3600 + minutes * 60 + seconds;
      job.progress = Math.min(100, Math.round((currentTime / duration) * 100));
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
 * Build FFmpeg arguments for HLS transcoding
 */
function buildFfmpegArgs(
  input: string,
  output: string,
  segmentPattern: string,
  settings: ReturnType<typeof getTranscodeSettings>,
  mediaInfo: MediaInfo,
  copyVideo = false,
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
  args.push(
    '-c:a',
    settings.audioCodec === 'opus' ? 'libopus' : 'aac',
    '-b:a',
    settings.audioBitrate.toString(),
    '-ar',
    '48000',
  );

  // Select best audio stream (prefer default, then highest quality)
  if (mediaInfo.audio.length > 0) {
    const defaultAudio = mediaInfo.audio.find((a) => a.default) || mediaInfo.audio[0];
    args.push('-map', `0:a:${mediaInfo.audio.indexOf(defaultAudio)}`);
  }

  // Map video
  args.push('-map', '0:v:0');

  // HLS settings
  args.push(
    '-f',
    'hls',
    '-hls_time',
    '6', // 6 second segments
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
