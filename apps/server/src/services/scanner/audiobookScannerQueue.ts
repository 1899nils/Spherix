import { Queue, Worker, type Job } from 'bullmq';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { scanAudiobookLibrary } from './audiobookScanner.js';

const QUEUE_NAME = 'audiobook-scan';

interface AudiobookScanJobData {
  rootPath?: string;
}

export const audiobookScanQueue = new Queue<AudiobookScanJobData>(QUEUE_NAME, {
  connection: { url: env.redisUrl },
  defaultJobOptions: {
    attempts:         1,
    removeOnComplete: { count: 10 },
    removeOnFail:     { count: 20 },
  },
});

let worker: Worker<AudiobookScanJobData> | null = null;

export function startAudiobookScanWorker(): void {
  if (worker) return;

  worker = new Worker<AudiobookScanJobData>(
    QUEUE_NAME,
    async (job: Job<AudiobookScanJobData>) => {
      const rootPath = job.data.rootPath ?? env.audiobookPath;
      logger.info(`[AudiobookScanWorker] Starting audiobook library scan at ${rootPath}`);
      return await scanAudiobookLibrary(rootPath);
    },
    {
      connection:  { url: env.redisUrl },
      concurrency: 1,
    },
  );

  worker.on('completed', (job) => {
    logger.info(`[AudiobookScanWorker] Job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    logger.error(`[AudiobookScanWorker] Job ${job?.id} failed: ${err.message}`);
  });

  logger.info('Audiobook scan worker started');
}

export async function enqueueAudiobookScan(rootPath?: string): Promise<string> {
  const active = await audiobookScanQueue.getJobs(['active', 'waiting']);
  if (active.length > 0) {
    logger.info('[AudiobookScanQueue] Scan already queued, skipping');
    return active[0].id!;
  }
  const job = await audiobookScanQueue.add('scan', { rootPath });
  logger.info(`[AudiobookScanQueue] Enqueued audiobook scan job ${job.id} (path: ${rootPath ?? 'default'})`);
  return job.id!;
}

export async function stopAudiobookScanWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Audiobook scan worker stopped');
  }
}
