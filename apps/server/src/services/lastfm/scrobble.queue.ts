import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../../config/redis.js';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { lastfmService, LastfmTrackInfo } from './lastfm.service.js';

const QUEUE_NAME = 'scrobble-queue';

export const scrobbleQueue = new Queue(QUEUE_NAME, { connection: redis });

interface ScrobbleJobData {
  userId: string;
  track: LastfmTrackInfo;
  timestamp?: number; // If missing, it's a "Now Playing" update
}

/**
 * Worker to process Last.fm scrobbles and now playing updates.
 */
export const scrobbleWorker = new Worker(
  QUEUE_NAME,
  async (job: Job<ScrobbleJobData>) => {
    const { userId, track, timestamp } = job.data;

    const userSettings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!userSettings?.lastfmSessionKey) {
      return; // No Last.fm account connected
    }

    try {
      if (timestamp) {
        // Full scrobble
        await lastfmService.scrobble(userSettings.lastfmSessionKey, track, timestamp);
        logger.info('Track scrobbled to Last.fm', { userId, track: track.track });
      } else {
        // "Now Playing" update
        await lastfmService.updateNowPlaying(userSettings.lastfmSessionKey, track);
        logger.info('Now Playing updated on Last.fm', { userId, track: track.track });
      }
    } catch (error) {
      logger.error('Last.fm scrobble job failed', { 
        jobId: job.id, 
        error: String(error),
        track: track.track 
      });
      throw error; // Let BullMQ handle retries
    }
  },
  { 
    connection: redis,
    limiter: {
      max: 5,
      duration: 1000, // Max 5 requests per second to stay within Last.fm limits
    }
  }
);

scrobbleWorker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed with ${err.message}`);
});
