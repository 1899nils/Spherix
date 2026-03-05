import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
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
 * Start a new transcode job for HLS streaming
 */
export async function startHlsTranscode(
  mediaId: string,
  mediaType: 'movie' | 'episode',
  inputPath: string,
  mediaInfo: MediaInfo,
  clientCaps: ClientCapabilities
): Promise<TranscodeJob> {
  const jobId = generateJobId(mediaId);
  const outputDir = join(getTranscodeDirectory(), jobId);
  
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const settings = getTranscodeSettings(mediaInfo, clientCaps);
  
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
  startTranscodingProcess(job, mediaInfo);

  logger.info(`Started HLS transcode job ${jobId} for ${mediaType} ${mediaId}`);
  return job;
}

/**
 * Start FFmpeg process for HLS transcoding
 */
function startTranscodingProcess(job: TranscodeJob, mediaInfo: MediaInfo): void {
  job.status = 'processing';

  const outputPath = join(job.outputDir, 'playlist.m3u8');
  const segmentPath = join(job.outputDir, 'segment_%03d.ts');

  // Build FFmpeg arguments
  const args = buildFfmpegArgs(job.inputPath, outputPath, segmentPath, job.settings, mediaInfo);

  logger.debug(`FFmpeg command: ffmpeg ${args.join(' ')}`);

  const ffmpeg = spawn('ffmpeg', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  job.process = ffmpeg;

  // Parse progress from stderr
  let duration = mediaInfo.duration || 0;
  
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
  mediaInfo: MediaInfo
): string[] {
  const args: string[] = [
    '-hide_banner',
    '-y', // Overwrite output files
    '-i', input,
  ];

  // Video codec settings
  const videoCodec = settings.videoCodec === 'hevc' ? 'libx265' : 'libx264';
  const preset = 'veryfast'; // Balance between speed and quality
  
  args.push(
    '-c:v', videoCodec,
    '-preset', preset,
    '-b:v', settings.videoBitrate.toString(),
    '-maxrate', Math.round(settings.videoBitrate * 1.5).toString(),
    '-bufsize', Math.round(settings.videoBitrate * 2).toString(),
    '-s', `${settings.maxResolution.width}x${settings.maxResolution.height}`,
    '-pix_fmt', 'yuv420p', // For browser compatibility
    '-g', '48', // GOP size for HLS
    '-keyint_min', '48',
    '-sc_threshold', '0',
  );

  // Audio codec settings
  args.push(
    '-c:a', settings.audioCodec === 'opus' ? 'libopus' : 'aac',
    '-b:a', settings.audioBitrate.toString(),
    '-ar', '48000',
  );

  // Select best audio stream (prefer default, then highest quality)
  if (mediaInfo.audio.length > 0) {
    const defaultAudio = mediaInfo.audio.find(a => a.default) || mediaInfo.audio[0];
    args.push('-map', `0:a:${mediaInfo.audio.indexOf(defaultAudio)}`);
  }

  // Map video
  args.push('-map', '0:v:0');

  // HLS settings
  args.push(
    '-f', 'hls',
    '-hls_time', '6', // 6 second segments
    '-hls_list_size', '0', // Keep all segments
    '-hls_segment_filename', segmentPattern,
    '-hls_playlist_type', 'vod',
    '-start_number', '0',
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
 * Clean up old transcode files
 */
export function cleanupOldTranscodes(maxAgeHours: number = 24): void {
  const _transcodeDir = getTranscodeDirectory();
  const now = Date.now();
  
  // Clean up completed/failed jobs older than maxAgeHours
  for (const [jobId, job] of activeJobs.entries()) {
    if (job.status === 'completed' || job.status === 'failed') {
      const jobTime = parseInt(jobId.split('_').pop() || '0');
      if (now - jobTime > maxAgeHours * 60 * 60 * 1000) {
        activeJobs.delete(jobId);
        // Note: File cleanup would require fs-extra or similar
        logger.debug(`Cleaned up old transcode job ${jobId}`);
      }
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
  clientCaps: any
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
