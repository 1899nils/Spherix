import { getCached, CACHE_TTLS } from '../cache.service.js';
import { logger } from '../../../config/logger.js';
import { prisma } from '../../../config/database.js';
import { redis } from '../../../config/redis.js';

// YouTube API daily quota limit (free tier: 100, we use 90 to be safe)
const YOUTUBE_DAILY_LIMIT = 90;
const YOUTUBE_COUNTER_KEY = 'youtube:daily:count';

export interface YouTubeVideoResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail?: string;
  url: string;
}

/**
 * Check and increment daily YouTube API quota
 * Returns true if request is allowed, false if limit reached
 */
async function checkAndIncrementQuota(): Promise<boolean> {
  try {
    // Get current count
    const current = await redis.get(YOUTUBE_COUNTER_KEY);
    const count = current ? parseInt(current, 10) : 0;
    
    if (count >= YOUTUBE_DAILY_LIMIT) {
      logger.warn('YouTube API daily quota reached', { 
        limit: YOUTUBE_DAILY_LIMIT,
        used: count 
      });
      return false;
    }
    
    // Increment counter and set expiry if new
    const multi = redis.multi();
    multi.incr(YOUTUBE_COUNTER_KEY);
    
    // Set TTL to end of day if not already set
    if (!current) {
      const now = new Date();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const ttlSeconds = Math.floor((endOfDay.getTime() - now.getTime()) / 1000);
      multi.expire(YOUTUBE_COUNTER_KEY, ttlSeconds);
    }
    
    await multi.exec();
    
    logger.debug('YouTube API quota used', { 
      used: count + 1, 
      limit: YOUTUBE_DAILY_LIMIT,
      remaining: YOUTUBE_DAILY_LIMIT - count - 1 
    });
    
    return true;
  } catch (error) {
    logger.error('Failed to check YouTube quota', { error: String(error) });
    // Allow request on error (fail open)
    return true;
  }
}

/**
 * Get current quota status for monitoring
 */
export async function getQuotaStatus(): Promise<{ used: number; limit: number; remaining: number }> {
  try {
    const current = await redis.get(YOUTUBE_COUNTER_KEY);
    const used = current ? parseInt(current, 10) : 0;
    return {
      used,
      limit: YOUTUBE_DAILY_LIMIT,
      remaining: Math.max(0, YOUTUBE_DAILY_LIMIT - used),
    };
  } catch {
    return { used: 0, limit: YOUTUBE_DAILY_LIMIT, remaining: YOUTUBE_DAILY_LIMIT };
  }
}

/**
 * Get YouTube API key from user settings
 */
export async function getYouTubeApiKey(userId?: string): Promise<string | undefined> {
  if (userId) {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { youtubeApiKey: true },
    });
    if (settings?.youtubeApiKey) return settings.youtubeApiKey;
  }

  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;

  // Fallback: use any stored key in the database (single-user setups without sessions)
  const anySettings = await prisma.userSettings.findFirst({
    where: { youtubeApiKey: { not: null } },
    select: { youtubeApiKey: true },
  });
  return anySettings?.youtubeApiKey ?? undefined;
}

/**
 * Search for music video on YouTube with caching and daily quota limit
 */
export async function searchMusicVideo(
  trackTitle: string,
  artistName: string,
  apiKey: string
): Promise<YouTubeVideoResult | null> {
  const cacheKey = `youtube:mv:${artistName}:${trackTitle}`;
  const searchQuery = `${artistName} ${trackTitle} official music video`;

  return getCached(
    cacheKey,
    async () => {
      // Check daily quota before making API call
      const quotaAvailable = await checkAndIncrementQuota();
      if (!quotaAvailable) {
        logger.warn('YouTube API quota exhausted, skipping search', {
          track: trackTitle,
          artist: artistName,
        });
        // Return empty result to avoid repeated searches
        // This will be cached with short TTL to prevent hammering
        return null;
      }

      const params = new URLSearchParams({
        part: 'snippet',
        q: searchQuery,
        type: 'video',
        videoCategoryId: '10', // Music
        maxResults: '3',
        key: apiKey,
      });

      try {
        const response = await fetch(
          `https://www.googleapis.com/youtube/v3/search?${params}`,
          { signal: AbortSignal.timeout(10_000) }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`YouTube API error: ${response.status} - ${error}`);
        }

        const data = await response.json() as {
          items?: Array<{
            id?: { videoId?: string };
            snippet?: {
              title?: string;
              channelTitle?: string;
              thumbnails?: { default?: { url?: string }; medium?: { url?: string } };
            };
          }>;
        };

        if (!data.items || data.items.length === 0) {
          return null;
        }

        const video = data.items[0];
        const videoId = video.id?.videoId;
        
        if (!videoId) return null;

        return {
          videoId,
          title: video.snippet?.title || '',
          channelTitle: video.snippet?.channelTitle || '',
          thumbnail: video.snippet?.thumbnails?.medium?.url || 
                     video.snippet?.thumbnails?.default?.url,
          url: `https://www.youtube.com/watch?v=${videoId}`,
        };
      } catch (error) {
        logger.warn('YouTube music video search failed', { 
          track: trackTitle,
          artist: artistName,
          error: String(error) 
        });
        return null;
      }
    },
    CACHE_TTLS.youtube
  );
}

/**
 * Check if cached video is still valid (returns cached data or null)
 */
export async function getCachedVideo(trackId: string): Promise<{ url: string; source: string } | null> {
  const track = await prisma.track.findUnique({
    where: { id: trackId },
    select: {
      musicVideoUrl: true,
      musicVideoSource: true,
      musicVideoCheckedAt: true,
    },
  });

  if (!track?.musicVideoUrl || !track.musicVideoCheckedAt) {
    return null;
  }

  // Check if cache is still valid (30 days)
  const cacheExpiry = new Date(track.musicVideoCheckedAt);
  cacheExpiry.setDate(cacheExpiry.getDate() + 30);
  
  if (new Date() > cacheExpiry) {
    return null;
  }

  return {
    url: track.musicVideoUrl,
    source: track.musicVideoSource || 'youtube',
  };
}

/**
 * Save music video to database
 */
export async function saveMusicVideo(
  trackId: string,
  video: YouTubeVideoResult,
  source: string = 'youtube'
): Promise<void> {
  await prisma.track.update({
    where: { id: trackId },
    data: {
      musicVideoUrl: video.url,
      musicVideoSource: source,
      musicVideoCheckedAt: new Date(),
    },
  });
  
  logger.debug('Music video saved to database', { trackId, videoId: video.videoId });
}

/**
 * Remove music video from track
 */
export async function removeMusicVideo(trackId: string): Promise<void> {
  await prisma.track.update({
    where: { id: trackId },
    data: {
      musicVideoUrl: null,
      musicVideoSource: null,
      musicVideoCheckedAt: null,
    },
  });
}

/**
 * Search for music video on MusicBrainz first, then YouTube fallback
 */
export async function findMusicVideo(
  trackId: string,
  trackTitle: string,
  artistName: string,
  options: {
    userId?: string;
    forceRefresh?: boolean;
  } = {}
): Promise<YouTubeVideoResult | null> {
  // Check cache first
  if (!options.forceRefresh) {
    const cached = await getCachedVideo(trackId);
    if (cached) {
      logger.debug('Using cached music video', { trackId });
      // Return cached as result format
      const videoId = cached.url.match(/[?&]v=([^&]+)/)?.[1];
      if (videoId) {
        return {
          videoId,
          title: '', // We don't store these in DB
          channelTitle: '',
          url: cached.url,
        };
      }
    }
  }

  // Get API key
  const apiKey = await getYouTubeApiKey(options.userId);
  if (!apiKey) {
    logger.debug('YouTube API key not configured');
    return null;
  }

  // Search YouTube
  const result = await searchMusicVideo(trackTitle, artistName, apiKey);
  
  if (result) {
    await saveMusicVideo(trackId, result, 'youtube');
  } else {
    // Mark as checked even if not found to avoid repeated searches
    await prisma.track.update({
      where: { id: trackId },
      data: { musicVideoCheckedAt: new Date() },
    });
  }

  return result;
}

/**
 * Batch search for music videos (optimized for albums)
 * Respects daily quota limit - stops when limit reached
 */
export async function batchFindMusicVideos(
  tracks: Array<{ id: string; title: string; artistName: string }>,
  userId?: string
): Promise<Map<string, YouTubeVideoResult | null>> {
  const apiKey = await getYouTubeApiKey(userId);
  if (!apiKey) {
    return new Map(tracks.map(t => [t.id, null]));
  }

  // Check remaining quota
  const quotaStatus = await getQuotaStatus();
  if (quotaStatus.remaining === 0) {
    logger.warn('YouTube API quota exhausted, skipping batch search');
    return new Map(tracks.map(t => [t.id, null]));
  }

  const results = new Map<string, YouTubeVideoResult | null>();
  const tracksToProcess = tracks.slice(0, quotaStatus.remaining); // Only process what quota allows
  
  if (tracksToProcess.length < tracks.length) {
    logger.warn('YouTube API quota limited batch search', {
      requested: tracks.length,
      processing: tracksToProcess.length,
      skipped: tracks.length - tracksToProcess.length,
    });
  }

  // Process sequentially to avoid rate limits
  for (const track of tracksToProcess) {
    // Check cache first (doesn't use quota)
    const cached = await getCachedVideo(track.id);
    if (cached) {
      const videoId = cached.url.match(/[?&]v=([^&]+)/)?.[1];
      if (videoId) {
        results.set(track.id, {
          videoId,
          title: '',
          channelTitle: '',
          url: cached.url,
        });
        continue;
      }
    }

    // Search YouTube (uses quota)
    const result = await searchMusicVideo(track.title, track.artistName, apiKey);
    
    if (result) {
      await saveMusicVideo(track.id, result, 'youtube');
    } else {
      await prisma.track.update({
        where: { id: track.id },
        data: { musicVideoCheckedAt: new Date() },
      });
    }
    
    results.set(track.id, result);
  }

  // Mark remaining tracks as not processed due to quota
  for (const track of tracks.slice(tracksToProcess.length)) {
    results.set(track.id, null);
  }

  return results;
}
