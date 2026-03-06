import { mbFetch, caaFetch, ensureHttps } from '../../musicbrainz/client.js';
import { getCached, CACHE_TTLS } from '../cache.service.js';
import { logger } from '../../../config/logger.js';

// Re-export the base client functions with enhanced caching
export { mbFetch, caaFetch, ensureHttps };

export interface MBRecording {
  id: string;
  title: string;
  length?: number;
  isrcs?: string[];
  relations?: Array<{
    type: string;
    url?: { resource: string };
  }>;
}

export interface MBRelease {
  id: string;
  title: string;
  date?: string;
  country?: string;
  'label-info'?: Array<{
    label?: { name: string };
  }>;
  'artist-credit'?: Array<{
    name: string;
    joinphrase?: string;
    artist?: { id: string; name: string };
  }>;
  media?: Array<{
    position: number;
    tracks?: Array<{
      position: number;
      title: string;
      length?: number;
      recording: {
        id: string;
        title: string;
        length?: number;
        isrcs?: string[];
      };
    }>;
  }>;
  tags?: Array<{ name: string; count: number }>;
}

/**
 * Get recording by ID with caching
 */
export async function getRecording(recordingId: string): Promise<MBRecording | null> {
  const cacheKey = `mb:recording:${recordingId}`;

  return getCached(
    cacheKey,
    async () => {
      try {
        const data = await mbFetch<{ recordings?: MBRecording[] }>(
          'recording',
          { query: `rid:${recordingId}`, limit: '1', inc: 'url-rels+isrcs' }
        );
        return data.recordings?.[0] || null;
      } catch (error) {
        logger.warn('MusicBrainz recording fetch failed', { recordingId, error: String(error) });
        return null;
      }
    },
    CACHE_TTLS.musicbrainz
  );
}

/**
 * Get release by ID with caching
 */
export async function getRelease(releaseId: string): Promise<MBRelease | null> {
  const cacheKey = `mb:release:${releaseId}`;

  return getCached(
    cacheKey,
    async () => {
      try {
        const data = await mbFetch<{ releases: MBRelease[] }>(
          'release',
          { query: `reid:${releaseId}`, limit: '1', inc: 'artist-credits+labels+media+recordings+tags' }
        );
        return data.releases?.[0] || null;
      } catch (error) {
        logger.warn('MusicBrainz release fetch failed', { releaseId, error: String(error) });
        return null;
      }
    },
    CACHE_TTLS.musicbrainz
  );
}

/**
 * Search for recordings with video relationships
 */
export async function searchVideoRecordings(
  trackTitle: string,
  artistName: string
): Promise<MBRecording[]> {
  const cacheKey = `mb:video:${artistName}:${trackTitle}`;

  return getCached(
    cacheKey,
    async () => {
      try {
        const query = `recording:"${trackTitle}" AND artist:"${artistName}"`;
        const data = await mbFetch<{ recordings?: MBRecording[] }>(
          'recording',
          { query, limit: '5', inc: 'url-rels' }
        );

        // Filter recordings with video relationships
        return (data.recordings || []).filter(r => 
          r.relations?.some(rel => 
            rel.type?.toLowerCase().includes('video')
          )
        );
      } catch (error) {
        logger.warn('MusicBrainz video search failed', { trackTitle, artistName, error: String(error) });
        return [];
      }
    },
    CACHE_TTLS.musicbrainz
  );
}

/**
 * Get ISRC for a recording
 */
export async function getRecordingIsrc(recordingId: string): Promise<string | null> {
  const recording = await getRecording(recordingId);
  return recording?.isrcs?.[0] || null;
}

/**
 * Get cover art URL with caching
 */
export async function getCoverArtUrl(releaseId: string): Promise<string | null> {
  const cacheKey = `caa:front:${releaseId}`;

  return getCached(
    cacheKey,
    async () => {
      try {
        const data = await caaFetch<{ images?: Array<{ front?: boolean; thumbnails?: { '500'?: string } }> }>(
          `release/${releaseId}`
        );
        
        const frontImage = data.images?.find(img => img.front);
        const url = frontImage?.thumbnails?.['500'];
        
        return url ? ensureHttps(url) : null;
      } catch (error) {
        logger.warn('Cover Art Archive fetch failed', { releaseId, error: String(error) });
        return null;
      }
    },
    CACHE_TTLS.coverArt
  );
}

/**
 * Get artist MBID by name
 */
export async function searchArtist(artistName: string): Promise<string | null> {
  const cacheKey = `mb:artist:search:${artistName.toLowerCase()}`;

  return getCached(
    cacheKey,
    async () => {
      try {
        const data = await mbFetch<{ artists?: Array<{ id: string; name: string }> }>(
          'artist',
          { query: `artist:"${artistName}"`, limit: '1' }
        );
        return data.artists?.[0]?.id || null;
      } catch (error) {
        logger.warn('MusicBrainz artist search failed', { artistName, error: String(error) });
        return null;
      }
    },
    CACHE_TTLS.musicbrainz
  );
}

/**
 * Get artist info with tags
 */
export async function getArtistInfo(artistId: string): Promise<{
  name: string;
  country?: string;
  type?: string;
  tags: string[];
} | null> {
  const cacheKey = `mb:artist:${artistId}`;

  return getCached(
    cacheKey,
    async () => {
      try {
        const data = await mbFetch<{ artists?: Array<{
          name: string;
          country?: string;
          type?: string;
          tags?: Array<{ name: string }>;
        }> }>(
          'artist',
          { query: `arid:${artistId}`, limit: '1', inc: 'tags' }
        );

        const artist = data.artists?.[0];
        if (!artist) return null;

        return {
          name: artist.name,
          country: artist.country,
          type: artist.type,
          tags: artist.tags?.map(t => t.name) || [],
        };
      } catch (error) {
        logger.warn('MusicBrainz artist info failed', { artistId, error: String(error) });
        return null;
      }
    },
    CACHE_TTLS.musicbrainz
  );
}
