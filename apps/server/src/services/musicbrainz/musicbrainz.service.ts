import { mbFetch, caaFetch } from './client.js';
import type {
  MBRelease,
  MBReleaseSearchResponse,
  MBArtist,
  MBArtistSearchResponse,
  MBRecordingSearchResponse,
  CAAResponse,
} from './types.js';

// ─── Release (Album) ────────────────────────────────────────────────────────

/**
 * Search for releases (albums) by free-text query.
 * Returns up to `limit` results starting at `offset`.
 */
export async function searchRelease(
  query: string,
  limit = 25,
  offset = 0,
): Promise<MBReleaseSearchResponse> {
  return mbFetch<MBReleaseSearchResponse>('release', {
    query,
    limit: String(limit),
    offset: String(offset),
  });
}

/**
 * Get full release details by MusicBrainz ID.
 * Includes artist credits, labels, media/tracks, and cover-art-archive info.
 */
export async function getReleaseById(mbid: string): Promise<MBRelease> {
  return mbFetch<MBRelease>(`release/${mbid}`, {
    inc: 'artist-credits+labels+recordings+release-groups+tags',
  });
}

// ─── Artist ─────────────────────────────────────────────────────────────────

/**
 * Search for artists by free-text query.
 */
export async function searchArtist(
  query: string,
  limit = 25,
  offset = 0,
): Promise<MBArtistSearchResponse> {
  return mbFetch<MBArtistSearchResponse>('artist', {
    query,
    limit: String(limit),
    offset: String(offset),
  });
}

/**
 * Get full artist details by MusicBrainz ID.
 * Includes aliases, tags, URL relations, and release groups (discography).
 */
export async function getArtistById(mbid: string): Promise<MBArtist> {
  return mbFetch<MBArtist>(`artist/${mbid}`, {
    inc: 'aliases+tags+url-rels+release-groups',
  });
}

// ─── Recording (Track) ──────────────────────────────────────────────────────

/**
 * Search for recordings (tracks) by free-text query.
 */
export async function searchRecording(
  query: string,
  limit = 25,
  offset = 0,
): Promise<MBRecordingSearchResponse> {
  return mbFetch<MBRecordingSearchResponse>('recording', {
    query,
    limit: String(limit),
    offset: String(offset),
  });
}

// ─── Cover Art ──────────────────────────────────────────────────────────────

/**
 * Get the front cover art URL for a release from the Cover Art Archive.
 * Returns the URL string or null if no cover art exists.
 */
export async function getCoverArtUrl(
  releaseMbid: string,
): Promise<string | null> {
  try {
    const data = await caaFetch<CAAResponse>(`release/${releaseMbid}`);
    const front = data.images.find((img) => img.front);
    if (front) {
      return front.thumbnails['500'] ?? front.thumbnails.large ?? front.image;
    }
    // Fall back to first image
    if (data.images.length > 0) {
      const first = data.images[0];
      return first.thumbnails['500'] ?? first.thumbnails.large ?? first.image;
    }
    return null;
  } catch {
    // 404 = no cover art, which is normal
    return null;
  }
}
