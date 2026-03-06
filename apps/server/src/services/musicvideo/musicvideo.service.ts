import { mbFetch } from '../musicbrainz/client.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/database.js';

// Cache results for 30 days
const VIDEO_CACHE_DAYS = 30;

interface MusicVideoResult {
  url: string;
  source: 'musicbrainz' | 'lastfm' | 'youtube';
  title?: string;
}

/**
 * Check if we have a cached music video that's still valid
 */
export async function getCachedMusicVideo(trackId: string): Promise<MusicVideoResult | null> {
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

  // Check if cache is still valid
  const cacheExpiry = new Date(track.musicVideoCheckedAt);
  cacheExpiry.setDate(cacheExpiry.getDate() + VIDEO_CACHE_DAYS);
  
  if (new Date() > cacheExpiry) {
    return null; // Cache expired
  }

  return {
    url: track.musicVideoUrl,
    source: track.musicVideoSource as 'musicbrainz' | 'lastfm' | 'youtube',
  };
}

/**
 * Save music video result to database
 */
export async function saveMusicVideo(
  trackId: string, 
  result: MusicVideoResult
): Promise<void> {
  await prisma.track.update({
    where: { id: trackId },
    data: {
      musicVideoUrl: result.url,
      musicVideoSource: result.source,
      musicVideoCheckedAt: new Date(),
    },
  });
}

/**
 * Search for music video on MusicBrainz
 */
export async function searchMusicBrainz(
  trackTitle: string, 
  artistName: string
): Promise<MusicVideoResult | null> {
  try {
    // Search for recordings with video relationships
    const query = `recording:"${trackTitle}" AND artist:"${artistName}"`;
    const response = await mbFetch<{ recordings?: Array<{
      id: string;
      title: string;
      relations?: Array<{
        url?: { resource: string };
        type: string;
      }>;
    }> } }>('recording', {
      query,
      limit: '5',
      inc: 'url-rels',
    });

    if (!response.recordings || response.recordings.length === 0) {
      return null;
    }

    // Look for video relationships
    for (const recording of response.recordings) {
      if (recording.relations) {
        for (const relation of recording.relations) {
          // Check for video streaming links
          if (relation.type?.toLowerCase().includes('video') && relation.url?.resource) {
            return {
              url: relation.url.resource,
              source: 'musicbrainz',
              title: recording.title,
            };
          }
        }
      }
    }

    return null;
  } catch (error) {
    logger.warn('MusicBrainz music video search failed', { error: String(error) });
    return null;
  }
}

/**
 * Search for music video on Last.fm (as fallback)
 */
export async function searchLastFm(
  trackTitle: string, 
  artistName: string,
  apiKey?: string
): Promise<MusicVideoResult | null> {
  if (!apiKey) {
    logger.debug('Last.fm API key not configured, skipping music video search');
    return null;
  }

  try {
    const params = new URLSearchParams({
      method: 'track.getInfo',
      api_key: apiKey,
      artist: artistName,
      track: trackTitle,
      format: 'json',
    });

    const response = await fetch(`https://ws.audioscrobbler.com/2.0/?${params.toString()}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as {
      track?: {
        url?: string;
        musicvideo?: { url?: string };
      };
    };

    // Last.fm doesn't directly provide video URLs, but we can check for special fields
    // This is a placeholder - Last.fm API doesn't really have music videos
    // We'll use this as a signal to try YouTube instead
    return null;
  } catch (error) {
    logger.warn('Last.fm music video search failed', { error: String(error) });
    return null;
  }
}

/**
 * Search for music video on YouTube (as final fallback)
 */
export async function searchYouTube(
  trackTitle: string, 
  artistName: string,
  apiKey?: string
): Promise<MusicVideoResult | null> {
  if (!apiKey) {
    logger.debug('YouTube API key not configured, skipping music video search');
    return null;
  }

  try {
    // Search for official music video
    const query = `${artistName} ${trackTitle} official music video`;
    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      videoCategoryId: '10', // Music category
      maxResults: '3',
      key: apiKey,
    });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
      { signal: AbortSignal.timeout(10_000) }
    );

    if (!response.ok) {
      const error = await response.text();
      logger.warn('YouTube API error', { status: response.status, error });
      return null;
    }

    const data = await response.json() as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: { title?: string };
      }>;
    };

    if (!data.items || data.items.length === 0) {
      return null;
    }

    // Take the first result
    const video = data.items[0];
    if (video.id?.videoId) {
      return {
        url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
        source: 'youtube',
        title: video.snippet?.title,
      };
    }

    return null;
  } catch (error) {
    logger.warn('YouTube music video search failed', { error: String(error) });
    return null;
  }
}

/**
 * Find music video using all available sources
 */
export async function findMusicVideo(
  trackId: string,
  trackTitle: string,
  artistName: string,
  options: {
    lastFmApiKey?: string;
    youtubeApiKey?: string;
    forceRefresh?: boolean;
  } = {}
): Promise<MusicVideoResult | null> {
  // Check cache first (unless force refresh)
  if (!options.forceRefresh) {
    const cached = await getCachedMusicVideo(trackId);
    if (cached) {
      logger.debug('Using cached music video', { trackId, source: cached.source });
      return cached;
    }
  }

  // Try MusicBrainz first
  logger.debug('Searching MusicBrainz for music video', { trackId, trackTitle, artistName });
  let result = await searchMusicBrainz(trackTitle, artistName);
  
  if (result) {
    await saveMusicVideo(trackId, result);
    return result;
  }

  // Try Last.fm as fallback
  if (options.lastFmApiKey) {
    logger.debug('Searching Last.fm for music video', { trackId });
    result = await searchLastFm(trackTitle, artistName, options.lastFmApiKey);
    
    if (result) {
      await saveMusicVideo(trackId, result);
      return result;
    }
  }

  // Try YouTube as final fallback
  if (options.youtubeApiKey) {
    logger.debug('Searching YouTube for music video', { trackId });
    result = await searchYouTube(trackTitle, artistName, options.youtubeApiKey);
    
    if (result) {
      await saveMusicVideo(trackId, result);
      return result;
    }
  }

  // No video found - save empty result to avoid repeated searches
  await prisma.track.update({
    where: { id: trackId },
    data: {
      musicVideoCheckedAt: new Date(),
    },
  });

  return null;
}
