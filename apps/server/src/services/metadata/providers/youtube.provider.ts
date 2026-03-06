import { getCached, CACHE_TTLS } from '../cache.service.js';
import { logger } from '../../../config/logger.js';
import { prisma } from '../../../config/database.js';

export interface YouTubeVideoResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail?: string;
  url: string;
}

/**
 * Get YouTube API key from user settings
 */
export async function getYouTubeApiKey(userId?: string): Promise<string | undefined> {
  if (!userId) {
    return process.env.YOUTUBE_API_KEY;
  }

  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { youtubeApiKey: true },
  });

  return settings?.youtubeApiKey || process.env.YOUTUBE_API_KEY;
}

/**
 * Search for music video on YouTube with caching
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
 */
export async function batchFindMusicVideos(
  tracks: Array<{ id: string; title: string; artistName: string }>,
  userId?: string
): Promise<Map<string, YouTubeVideoResult | null>> {
  const apiKey = await getYouTubeApiKey(userId);
  if (!apiKey) {
    return new Map(tracks.map(t => [t.id, null]));
  }

  const results = new Map<string, YouTubeVideoResult | null>();

  // Process sequentially to avoid rate limits
  for (const track of tracks) {
    // Check cache first
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

    // Search YouTube
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

  return results;
}
