import { Queue, Worker, type Job } from 'bullmq';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { scanVideoLibrary } from './videoScanner.js';

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

export function startVideoScanWorker(): void {
  if (worker) return;

  worker = new Worker<VideoScanJobData>(
    QUEUE_NAME,
    async (job: Job<VideoScanJobData>) => {
      const rootPath = job.data.rootPath ?? env.videoPath;
      logger.info(`[VideoScanWorker] Starting video library scan at ${rootPath}`);
      return await scanVideoLibrary(rootPath);
    },
    {
      connection:  { url: env.redisUrl },
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    logger.info(`[VideoScanWorker] Job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    logger.error(`[VideoScanWorker] Job ${job?.id} failed: ${err.message}`);
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
