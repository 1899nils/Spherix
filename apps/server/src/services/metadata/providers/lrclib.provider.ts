import { getCached, CACHE_TTLS } from '../cache.service.js';
import { logger } from '../../../config/logger.js';

const LRCLIB_BASE = 'https://lrclib.net/api';

export interface LrclibLyrics {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
  isrc: string | null;
}

/**
 * Search for lyrics by track metadata
 */
export async function searchLyrics(
  trackTitle: string,
  artistName: string,
  albumName?: string,
  duration?: number
): Promise<LrclibLyrics | null> {
  const cacheKey = `lrclib:search:${artistName}:${trackTitle}:${albumName ?? ''}:${duration ?? ''}`;

  return getCached(
    cacheKey,
    async () => {
      const params = new URLSearchParams({
        track_name: trackTitle,
        artist_name: artistName,
      });
      if (albumName) params.set('album_name', albumName);
      if (duration) params.set('duration', String(duration));

      try {
        const response = await fetch(`${LRCLIB_BASE}/search?${params}`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error(`LRCLIB error: ${response.status}`);
        }

        const data = await response.json() as { results: LrclibLyrics[] };
        
        // Return best match (first result)
        if (data.results && data.results.length > 0) {
          return data.results[0];
        }
        return null;
      } catch (error) {
        logger.warn('LRCLIB search failed', { 
          track: trackTitle, 
          artist: artistName,
          error: String(error) 
        });
        return null;
      }
    },
    CACHE_TTLS.lrclib
  );
}

/**
 * Get lyrics by MusicBrainz recording ID
 */
export async function getLyricsByRecordingId(
  recordingId: string
): Promise<LrclibLyrics | null> {
  const cacheKey = `lrclib:mbid:${recordingId}`;

  return getCached(
    cacheKey,
    async () => {
      try {
        const response = await fetch(
          `${LRCLIB_BASE}/get/${recordingId}`,
          {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10_000),
          }
        );

        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error(`LRCLIB error: ${response.status}`);
        }

        return await response.json() as LrclibLyrics;
      } catch (error) {
        logger.warn('LRCLIB fetch by MBID failed', { 
          recordingId,
          error: String(error) 
        });
        return null;
      }
    },
    CACHE_TTLS.lrclib
  );
}

/**
 * Get lyrics by ISRC code
 */
export async function getLyricsByIsrc(isrc: string): Promise<LrclibLyrics | null> {
  const cacheKey = `lrclib:isrc:${isrc}`;

  return getCached(
    cacheKey,
    async () => {
      try {
        const response = await fetch(
          `${LRCLIB_BASE}/get/isrc/${isrc}`,
          {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10_000),
          }
        );

        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error(`LRCLIB error: ${response.status}`);
        }

        return await response.json() as LrclibLyrics;
      } catch (error) {
        logger.warn('LRCLIB fetch by ISRC failed', { 
          isrc,
          error: String(error) 
        });
        return null;
      }
    },
    CACHE_TTLS.lrclib
  );
}

/**
 * Format lyrics for storage (plain text only, synced is bonus)
 */
export function formatLyricsForStorage(lyrics: LrclibLyrics): string | null {
  if (lyrics.instrumental) return '[Instrumental]';
  return lyrics.plainLyrics ?? lyrics.syncedLyrics ?? null;
}
