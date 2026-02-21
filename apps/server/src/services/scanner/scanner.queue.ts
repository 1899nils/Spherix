import { Queue, Worker, type Job } from 'bullmq';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { scanLibrary } from './scanner.service.js';
import { scannerEvents } from './scanner.events.js';

const QUEUE_NAME = 'library-scan';

interface ScanJobData {
  libraryId: string;
}

/**
 * BullMQ queue for library scan jobs.
 */
export const scanQueue = new Queue<ScanJobData>(QUEUE_NAME, {
  connection: { url: env.redisUrl },
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});

let worker: Worker<ScanJobData> | null = null;

/**
 * Starts the BullMQ worker that processes scan jobs.
 * Call this once at server startup.
 */
export function startScanWorker(): void {
  if (worker) return;

  worker = new Worker<ScanJobData>(
    QUEUE_NAME,
    async (job: Job<ScanJobData>) => {
      logger.info(`Processing scan job ${job.id} for library ${job.data.libraryId}`);
      const result = await scanLibrary(job.data.libraryId);
      return result;
    },
    {
      connection: { url: env.redisUrl },
      concurrency: 1, // Only one scan at a time
    },
  );

  worker.on('completed', (job) => {
    logger.info(`Scan job ${job.id} completed`);
  });

  worker.on('failed', (job, error) => {
    logger.error(`Scan job ${job?.id} failed`, { error: error.message });
    if (job) {
      scannerEvents.emitError(error);
    }
  });

  logger.info('Library scan worker started');
}

/**
 * Enqueues a library scan job. Returns the job ID.
 */
export async function enqueueScan(libraryId: string): Promise<string> {
  // Prevent duplicate scans for the same library
  const activeJobs = await scanQueue.getJobs(['active', 'waiting']);
  const duplicate = activeJobs.find(
    (j) => j.data.libraryId === libraryId,
  );
  if (duplicate) {
    logger.info(`Scan already queued for library ${libraryId}, skipping`);
    return duplicate.id!;
  }

  const job = await scanQueue.add('scan', { libraryId });
  logger.info(`Enqueued scan job ${job.id} for library ${libraryId}`);
  return job.id!;
}

/**
 * Gracefully shuts down the scan worker.
 */
export async function stopScanWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info('Library scan worker stopped');
  }
}
