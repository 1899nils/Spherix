import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';

export interface CacheConfig {
  ttl: number; // seconds
  prefix: string;
}

export const CACHE_TTLS = {
  musicbrainz: 7 * 24 * 60 * 60,    // 7 days
  coverArt: 30 * 24 * 60 * 60,      // 30 days
  youtube: 30 * 24 * 60 * 60,       // 30 days
  lastfm: 14 * 24 * 60 * 60,        // 14 days
  lrclib: 90 * 24 * 60 * 60,        // 90 days (lyrics rarely change)
  artistBio: 14 * 24 * 60 * 60,     // 14 days
  similarArtists: 7 * 24 * 60 * 60, // 7 days
} as const;

/**
 * Generic cache wrapper for metadata providers
 */
export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number
): Promise<T> {
  // Try cache first
  try {
    const cached = await redis.get(key);
    if (cached) {
      logger.debug('Cache hit', { key });
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    logger.warn('Cache read failed', { key, error: String(err) });
  }

  // Fetch fresh data
  const data = await fetcher();

  // Store in cache (fire and forget)
  try {
    await redis.set(key, JSON.stringify(data), 'EX', ttl);
    logger.debug('Cache stored', { key, ttl });
  } catch (err) {
    logger.warn('Cache write failed', { key, error: String(err) });
  }

  return data;
}

/**
 * Batch cache get - returns null for missing keys
 */
export async function getCachedBatch<T>(keys: string[]): Promise<(T | null)[]> {
  try {
    const values = await redis.mget(...keys);
    return values.map(v => v ? JSON.parse(v) as T : null);
  } catch (err) {
    logger.warn('Batch cache read failed', { error: String(err) });
    return keys.map(() => null);
  }
}

/**
 * Batch cache set
 */
export async function setCachedBatch(
  entries: { key: string; value: unknown; ttl: number }[]
): Promise<void> {
  if (entries.length === 0) return;

  try {
    const pipeline = redis.pipeline();
    for (const { key, value, ttl } of entries) {
      pipeline.set(key, JSON.stringify(value), 'EX', ttl);
    }
    await pipeline.exec();
    logger.debug('Batch cache stored', { count: entries.length });
  } catch (err) {
    logger.warn('Batch cache write failed', { error: String(err) });
  }
}

/**
 * Invalidate cache by pattern (use with caution)
 */
export async function invalidateCache(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info('Cache invalidated', { pattern, count: keys.length });
    }
  } catch (err) {
    logger.warn('Cache invalidation failed', { pattern, error: String(err) });
  }
}
