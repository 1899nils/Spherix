import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { matchAlbum } from './match.service.js';
import { getReleaseById, getCoverArtUrl } from './musicbrainz.service.js';
import { downloadAndSaveCover } from '../metadata/cover-processing.service.js';
import { writeTags } from '../metadata/tagwriter.service.js';

const AUTO_LINK_THRESHOLD = 98;

export interface AutoMatchResult {
  albumId: string;
  matched: boolean;
  confidence?: number;
  musicbrainzId?: string;
  reason?: string;
}

/**
 * Attempts to automatically link an album to MusicBrainz if the best
 * candidate reaches at least AUTO_LINK_THRESHOLD (98%) confidence.
 * Always picks the candidate with the highest confidence score.
 */
export async function autoMatchAlbum(albumId: string): Promise<AutoMatchResult> {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: {
      artist: true,
      tracks: {
        select: { id: true, filePath: true, trackNumber: true, discNumber: true, title: true },
        orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
      },
      _count: { select: { tracks: true } },
    },
  });

  if (!album) {
    return { albumId, matched: false, reason: 'Album not found' };
  }

  if (album.musicbrainzId) {
    return { albumId, matched: false, reason: 'Already linked' };
  }

  const result = await matchAlbum({
    title: album.title,
    artistName: album.artist.name,
    year: album.year,
    trackCount: album._count.tracks,
  });

  if (!result.candidates.length) {
    return { albumId, matched: false, reason: 'No candidates found' };
  }

  // candidates is already sorted descending by confidence
  const best = result.candidates[0];

  if (best.confidence < AUTO_LINK_THRESHOLD) {
    return {
      albumId,
      matched: false,
      confidence: best.confidence,
      reason: `Best match confidence ${best.confidence}% below threshold ${AUTO_LINK_THRESHOLD}%`,
    };
  }

  const musicbrainzReleaseId = best.release.id;
  logger.info(
    `Auto-linking album "${album.title}" (${albumId}) to MusicBrainz release ${musicbrainzReleaseId} (confidence: ${best.confidence}%)`,
  );

  const release = await getReleaseById(musicbrainzReleaseId);
  const coverUrl = await getCoverArtUrl(musicbrainzReleaseId);

  const artistName =
    release['artist-credit']?.map((c) => c.name + (c.joinphrase || '')).join('') ??
    album.artist.name;
  const releaseYear = release.date ? parseInt(release.date.slice(0, 4), 10) : null;
  const label = release['label-info']?.[0]?.label?.name ?? null;
  const country = release.country ?? null;
  const genre = release.tags?.sort((a, b) => b.count - a.count)[0]?.name ?? null;
  const totalDiscs = release.media?.length ?? null;

  const mbTracks =
    release.media?.flatMap((m) =>
      (m.tracks ?? []).map((t) => ({
        discNumber: m.position,
        trackNumber: t.position,
        title: t.title,
        duration: t.length ? t.length / 1000 : null,
        musicbrainzId: t.recording.id,
      })),
    ) ?? [];

  // Resolve or create artist
  let artistId = album.artistId;
  if (artistName !== album.artist.name) {
    const existing = await prisma.artist.findFirst({
      where: { name: artistName },
      select: { id: true },
    });
    artistId = existing
      ? existing.id
      : (
          await prisma.artist.create({
            data: { name: artistName },
            select: { id: true },
          })
        ).id;
  }

  // Set artist's MusicBrainz ID if not already set
  const mbArtistId = release['artist-credit']?.[0]?.artist?.id;
  if (mbArtistId) {
    await prisma.artist.update({
      where: { id: artistId },
      data: { musicbrainzId: mbArtistId },
    });
  }

  // Download cover art locally
  let localCoverUrl: string | null = null;
  if (coverUrl) {
    const saved = await downloadAndSaveCover(coverUrl, album.id);
    if (saved) {
      localCoverUrl = saved.url500;
    } else {
      logger.warn(`Auto-match: could not download cover art for album ${album.id}`);
    }
  }

  // Update album
  await prisma.album.update({
    where: { id: album.id },
    data: {
      title: release.title,
      artistId,
      year: releaseYear,
      genre,
      label,
      country,
      totalDiscs,
      musicbrainzId: musicbrainzReleaseId,
      ...(localCoverUrl ? { coverUrl: localCoverUrl } : {}),
    },
  });

  // Match and update tracks by disc + track position
  for (const mbTrack of mbTracks) {
    const localTrack =
      album.tracks.find(
        (t) => t.discNumber === mbTrack.discNumber && t.trackNumber === mbTrack.trackNumber,
      ) ??
      album.tracks.find(
        (t) =>
          t.trackNumber === mbTrack.trackNumber &&
          album.tracks.every((tr) => tr.discNumber === 1 || tr.discNumber === null),
      );

    if (!localTrack) continue;

    await prisma.track.update({
      where: { id: localTrack.id },
      data: {
        title: mbTrack.title,
        artistId,
        musicbrainzId: mbTrack.musicbrainzId,
      },
    });

    try {
      await writeTags(localTrack.filePath, {
        title: mbTrack.title,
        artist: artistName,
        album: release.title,
        trackNumber: mbTrack.trackNumber,
        discNumber: mbTrack.discNumber,
        year: releaseYear ?? undefined,
        genre: genre ?? undefined,
      });
    } catch (err) {
      logger.warn(`Auto-match: failed to write tags for track ${localTrack.id}`, {
        error: String(err),
      });
    }
  }

  logger.info(
    `Auto-linked album "${album.title}" (${albumId}) → MusicBrainz release ${musicbrainzReleaseId}`,
  );

  return {
    albumId,
    matched: true,
    confidence: best.confidence,
    musicbrainzId: musicbrainzReleaseId,
  };
}
