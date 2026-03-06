import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import * as musicbrainz from './providers/musicbrainz.provider.js';
import * as youtube from './providers/youtube.provider.js';
import * as lastfm from './providers/lastfm.provider.js';
import * as lrclib from './providers/lrclib.provider.js';

export interface EnrichmentResult {
  albumId: string;
  enriched: boolean;
  changes: {
    cover?: boolean;
    metadata?: boolean;
    tracks?: number;
    lyrics?: number;
    musicVideos?: number;
  };
  errors: string[];
}

export interface TrackEnrichment {
  trackId: string;
  title: string;
  musicVideoUrl?: string;
  musicVideoSource?: string;
  lyrics?: string;
  musicbrainzId?: string;
}

interface LastfmConfig {
  apiKey: string;
  apiSecret: string;
}

function getLastfmConfig(): LastfmConfig | null {
  const apiKey = env.lastfmApiKey;
  const apiSecret = env.lastfmApiSecret;
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

/**
 * Enrich a single album with all available metadata sources
 * This is the main entry point for metadata enrichment
 */
export async function enrichAlbum(albumId: string): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    albumId,
    enriched: false,
    changes: {},
    errors: [],
  };

  // Get album with all tracks
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: {
      artist: true,
      tracks: {
        include: { artist: true },
        orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
      },
      _count: { select: { tracks: true } },
    },
  });

  if (!album) {
    result.errors.push('Album not found');
    return result;
  }

  const errors: string[] = [];
  const changes: EnrichmentResult['changes'] = {};

  // Parallel enrichment where possible
  const enrichmentPromises: Promise<void>[] = [];

  // 1. MusicBrainz enrichment (if linked or auto-matchable)
  if (album.musicbrainzId || !album.musicbrainzId) {
    enrichmentPromises.push(
      enrichFromMusicBrainz(album).then(updated => {
        if (updated) changes.metadata = true;
      }).catch(err => {
        logger.warn('MusicBrainz enrichment failed', { albumId, error: String(err) });
        errors.push('MusicBrainz: ' + String(err));
      })
    );
  }

  // 2. Cover art enrichment
  if (album.musicbrainzId) {
    enrichmentPromises.push(
      enrichCoverArt(album).then(updated => {
        if (updated) changes.cover = true;
      }).catch(err => {
        logger.warn('Cover art enrichment failed', { albumId, error: String(err) });
      })
    );
  }

  // 3. Artist metadata from Last.fm
  const lastfmConfig = getLastfmConfig();
  if (lastfmConfig) {
    enrichmentPromises.push(
      enrichArtistFromLastfm(album.artist.id, album.artist.name, lastfmConfig).catch(err => {
        logger.warn('Last.fm artist enrichment failed', { artistId: album.artist.id, error: String(err) });
      })
    );
  }

  // Wait for album-level enrichment
  await Promise.all(enrichmentPromises);

  // 4. Track-level enrichment (sequential to avoid rate limits)
  const trackEnrichment = await enrichTracks(album.tracks);
  changes.lyrics = trackEnrichment.lyricsCount;
  changes.musicVideos = trackEnrichment.videoCount;
  changes.tracks = trackEnrichment.updatedCount;

  result.enriched = Object.values(changes).some(v => 
    typeof v === 'boolean' ? v : v > 0
  );
  result.changes = changes;
  result.errors = errors;

  return result;
}

/**
 * Enrich album metadata from MusicBrainz
 */
async function enrichFromMusicBrainz(album: any): Promise<boolean> {
  if (!album.musicbrainzId) {
    // Try auto-match
    // This would call your existing auto-match service
    return false;
  }

  const release = await musicbrainz.getRelease(album.musicbrainzId);
  if (!release) return false;

  // Update album metadata
  const updateData: any = {};
  
  if (release.date && !album.releaseDate) {
    updateData.releaseDate = release.date;
  }
  if (release.country && !album.country) {
    updateData.country = release.country;
  }
  if (release['label-info']?.[0]?.label?.name && !album.label) {
    updateData.label = release['label-info'][0].label.name;
  }
  if (release.tags && !album.genre) {
    const topTag = release.tags.sort((a, b) => b.count - a.count)[0];
    if (topTag) updateData.genre = topTag.name;
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.album.update({
      where: { id: album.id },
      data: updateData,
    });
    return true;
  }

  return false;
}

/**
 * Enrich cover art
 */
async function enrichCoverArt(album: any): Promise<boolean> {
  if (!album.musicbrainzId || album.coverUrl) return false;

  const coverUrl = await musicbrainz.getCoverArtUrl(album.musicbrainzId);
  if (!coverUrl) return false;

  await prisma.album.update({
    where: { id: album.id },
    data: { coverUrl },
  });

  return true;
}

/**
 * Enrich artist metadata from Last.fm
 */
async function enrichArtistFromLastfm(
  artistId: string,
  artistName: string,
  config: LastfmConfig
): Promise<void> {
  // Check if artist already has bio
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: { biography: true },
  });

  if (artist?.biography) return; // Already has bio

  const info = await lastfm.getArtistInfo(artistName, config);
  if (!info?.bio?.content) return;

  await prisma.artist.update({
    where: { id: artistId },
    data: {
      biography: info.bio.content,
      ...(info.image ? { imageUrl: info.image } : {}),
    },
  });
}

interface TrackEnrichmentResult {
  lyricsCount: number;
  videoCount: number;
  updatedCount: number;
}

/**
 * Enrich tracks with lyrics and music videos
 */
async function enrichTracks(
  tracks: any[]
): Promise<TrackEnrichmentResult> {
  const result: TrackEnrichmentResult = {
    lyricsCount: 0,
    videoCount: 0,
    updatedCount: 0,
  };

  // Get YouTube API key
  const youtubeApiKey = await youtube.getYouTubeApiKey();

  for (const track of tracks) {
    const enrichments: any = {};

    // 1. Lyrics from LRCLIB (try MBID first, then search)
    if (!track.lyrics && track.musicbrainzId) {
      const lyrics = await lrclib.getLyricsByRecordingId(track.musicbrainzId);
      if (lyrics?.plainLyrics) {
        enrichments.lyrics = lrclib.formatLyricsForStorage(lyrics);
        result.lyricsCount++;
      }
    }
    
    if (!track.lyrics && !enrichments.lyrics) {
      const lyrics = await lrclib.searchLyrics(
        track.title,
        track.artist.name,
        track.album?.title
      );
      if (lyrics?.plainLyrics) {
        enrichments.lyrics = lrclib.formatLyricsForStorage(lyrics);
        result.lyricsCount++;
      }
    }

    // 2. Music video from YouTube
    if (!track.musicVideoUrl && youtubeApiKey) {
      const video = await youtube.searchMusicVideo(
        track.title,
        track.artist.name,
        youtubeApiKey
      );
      if (video) {
        enrichments.musicVideoUrl = video.url;
        enrichments.musicVideoSource = 'youtube';
        enrichments.musicVideoCheckedAt = new Date();
        result.videoCount++;
      }
    }

    // Note: Last.fm track metadata enrichment could be added here

    // Apply updates
    if (Object.keys(enrichments).length > 0) {
      await prisma.track.update({
        where: { id: track.id },
        data: enrichments,
      });
      result.updatedCount++;
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 100));
  }

  return result;
}

/**
 * Batch enrich multiple albums (for background jobs)
 */
export async function batchEnrichAlbums(albumIds: string[]): Promise<EnrichmentResult[]> {
  const results: EnrichmentResult[] = [];
  
  for (const albumId of albumIds) {
    try {
      const result = await enrichAlbum(albumId);
      results.push(result);
      
      // Delay between albums to be nice to APIs
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      results.push({
        albumId,
        enriched: false,
        changes: {},
        errors: [String(error)],
      });
    }
  }
  
  return results;
}

/**
 * Quick enrich - only fills missing data, no API calls if data exists
 */
export async function quickEnrichTrack(trackId: string): Promise<TrackEnrichment | null> {
  const track = await prisma.track.findUnique({
    where: { id: trackId },
    include: { artist: true, album: true },
  });

  if (!track) return null;

  const result: TrackEnrichment = {
    trackId,
    title: track.title,
  };

  const youtubeApiKey = await youtube.getYouTubeApiKey();

  // Only fetch what's missing
  if (!track.lyrics) {
    const lyrics = track.musicbrainzId 
      ? await lrclib.getLyricsByRecordingId(track.musicbrainzId)
      : await lrclib.searchLyrics(track.title, track.artist.name, track.album?.title);
    
    if (lyrics?.plainLyrics) {
      const formattedLyrics = lrclib.formatLyricsForStorage(lyrics);
      if (formattedLyrics) {
        result.lyrics = formattedLyrics;
      }
    }
  }

  if (!track.musicVideoUrl && youtubeApiKey) {
    const video = await youtube.searchMusicVideo(
      track.title,
      track.artist.name,
      youtubeApiKey
    );
    if (video) {
      result.musicVideoUrl = video.url;
      result.musicVideoSource = 'youtube';
    }
  }

  // Update database
  const updateData: Record<string, unknown> = {};
  if (result.lyrics) {
    updateData.lyrics = result.lyrics;
  }
  if (result.musicVideoUrl) {
    updateData.musicVideoUrl = result.musicVideoUrl;
    updateData.musicVideoSource = result.musicVideoSource ?? 'youtube';
    updateData.musicVideoCheckedAt = new Date();
  }
  
  if (Object.keys(updateData).length > 0) {
    await prisma.track.update({
      where: { id: trackId },
      data: updateData,
    });
  }

  return result;
}
