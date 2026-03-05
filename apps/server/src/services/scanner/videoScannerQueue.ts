import { Queue, Worker, type Job } from 'bullmq';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { scanVideoLibrary, type VideoScanProgress } from './videoScanner.js';

const QUEUE_NAME = 'video-scan';

interface VideoScanJobData {
  rootPath?: string;
}

export const videoScanQueue = new Queue<VideoScanJobData>(QUEUE_NAME, {
  connection: { url: env.redisUrl },
  defaultJobOptions: {
    attempts:         1,
    removeOnComplete: { count: 10 },
    removeOnFail:     { count: 20 },
  },
});

let worker: Worker<VideoScanJobData> | null = null;
let currentProgress: VideoScanProgress | null = null;
let currentJobId: string | null = null;

export function startVideoScanWorker(): void {
  if (worker) return;

  worker = new Worker<VideoScanJobData>(
    QUEUE_NAME,
    async (job: Job<VideoScanJobData>) => {
      const rootPath = job.data.rootPath ?? env.videoPath;
      currentJobId = job.id!;
      logger.info(`[VideoScanWorker] Starting video library scan at ${rootPath}`);
      
      // Reset progress at start
      currentProgress = {
        phase: 'discovering',
        total: 0,
        done: 0,
        movies: 0,
        episodes: 0,
        skipped: 0,
        errors: 0,
      };
      
      const result = await scanVideoLibrary(rootPath);
      currentProgress = result;
      return result;
    },
    {
      connection:  { url: env.redisUrl },
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    logger.info(`[VideoScanWorker] Job ${job.id} completed`);
    if (currentJobId === job.id) {
      currentProgress = job.returnvalue as VideoScanProgress;
      currentJobId = null;
    }
  });
  worker.on('failed', (job, err) => {
    logger.error(`[VideoScanWorker] Job ${job?.id} failed: ${err.message}`);
    if (job && currentJobId === job.id) {
      currentProgress = {
        phase: 'error',
        total: 0,
        done: 0,
        movies: 0,
        episodes: 0,
        skipped: 0,
        errors: 1,
        message: err.message,
      };
      currentJobId = null;
    }
  });

  logger.info('Video scan worker started');
}

export async function enqueueVideoScan(rootPath?: string): Promise<string> {
  const active = await videoScanQueue.getJobs(['active', 'waiting']);
  if (active.length > 0) {
    logger.info('[VideoScanQueue] Scan already queued, skipping');
    return active[0].id!;
  }
  const job = await videoScanQueue.add('scan', { rootPath });
  logger.info(`[VideoScanQueue] Enqueued video scan job ${job.id} (path: ${rootPath ?? 'default'})`);
  return job.id!;
}

export async function stopVideoScanWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Video scan worker stopped');
  }
}

/**
 * Get the current scan status
 */
export async function getVideoScanStatus(): Promise<{
  isScanning: boolean;
  progress: VideoScanProgress | null;
  jobId: string | null;
}> {
  const activeJobs = await videoScanQueue.getJobs(['active']);
  const waitingJobs = await videoScanQueue.getJobs(['waiting']);
  
  const isScanning = activeJobs.length > 0;
  const activeJob = activeJobs[0];
  
  return {
    isScanning,
    progress: currentProgress,
    jobId: activeJob?.id ?? waitingJobs[0]?.id ?? null,
  };
}

/**
 * Get scan history (last N completed jobs)
 */
export async function getVideoScanHistory(limit: number = 5): Promise<{
  id: string;
  completedAt: Date | null;
  result: VideoScanProgress | null;
}[]> {
  const jobs = await videoScanQueue.getJobs(['completed'], 0, limit, true);
  return jobs.map(job => ({
    id: job.id!,
    completedAt: job.finishedOn ? new Date(job.finishedOn) : null,
    result: job.returnvalue as VideoScanProgress | null,
  }));
}
