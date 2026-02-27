import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../config/database.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import {
  albumMetadataSchema,
  matchMusicbrainzSchema,
} from './schemas/metadata.schemas.js';
import { writeTags } from '../services/metadata/tagwriter.service.js';
import { processAndSaveCover, downloadAndSaveCover } from '../services/metadata/cover-processing.service.js';
import {
  getReleaseById,
  getCoverArtUrl,
  matchAlbum,
} from '../services/musicbrainz/index.js';
import { logger } from '../config/logger.js';
import type { AlbumWithRelations, PaginatedResponse } from '@musicserver/shared';

const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/** List all albums with pagination */
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50));
    const skip = (page - 1) * pageSize;
    const sort = (req.query.sort as string) || 'title';
    const artistId = req.query.artistId as string | undefined;

    const where = {
      ...(artistId ? { artistId } : {}),
    };

    const orderBy =
      sort === 'year' ? { year: 'desc' as const } :
      sort === 'newest' ? { createdAt: 'desc' as const } :
      { title: 'asc' as const };

    const [albums, total] = await Promise.all([
      prisma.album.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          artist: { select: { id: true, name: true } },
          _count: { select: { tracks: true } },
        },
        orderBy,
      }),
      prisma.album.count({ where }),
    ]);

    const data: AlbumWithRelations[] = albums.map((a: typeof albums[number]) => ({
      id: a.id,
      title: a.title,
      artistId: a.artistId,
      year: a.year,
      releaseDate: a.releaseDate?.toISOString() ?? null,
      genre: a.genre,
      coverUrl: a.coverUrl,
      musicbrainzId: a.musicbrainzId,
      totalTracks: a.totalTracks,
      totalDiscs: a.totalDiscs,
      label: a.label,
      country: a.country,
      createdAt: a.createdAt.toISOString(),
      artist: a.artist,
      trackCount: a._count.tracks,
    }));

    const response: PaginatedResponse<AlbumWithRelations> = {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/** Get album detail with tracks */
router.get('/:id', async (req, res, next) => {
  try {
    const album = await prisma.album.findUnique({
      where: { id: String(req.params.id) },
      include: {
        artist: { select: { id: true, name: true } },
        tracks: {
          include: {
            artist: { select: { id: true, name: true } },
          },
          orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
        },
      },
    });

    if (!album) {
      res.status(404).json({ error: 'Album not found', statusCode: 404 });
      return;
    }

    const tracks = album.tracks.map((t: typeof album.tracks[number]) => ({
      ...t,
      fileSize: t.fileSize.toString(),
      createdAt: t.createdAt.toISOString(),
      album: { id: album.id, title: album.title, coverUrl: album.coverUrl },
    }));

    res.json({
      data: {
        id: album.id,
        title: album.title,
        artistId: album.artistId,
        year: album.year,
        releaseDate: album.releaseDate?.toISOString() ?? null,
        genre: album.genre,
        coverUrl: album.coverUrl,
        musicbrainzId: album.musicbrainzId,
        totalTracks: album.totalTracks,
        totalDiscs: album.totalDiscs,
        label: album.label,
        country: album.country,
        createdAt: album.createdAt.toISOString(),
        artist: album.artist,
        trackCount: album.tracks.length,
        tracks,
      },
    });
  } catch (error) {
    next(error);
  }
});

/** Update album metadata */
router.patch('/:id', async (req, res, next) => {
  try {
    const { title, year, genre, label, country } = req.body;

    const album = await prisma.album.update({
      where: { id: String(req.params.id) },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(year !== undefined ? { year } : {}),
        ...(genre !== undefined ? { genre } : {}),
        ...(label !== undefined ? { label } : {}),
        ...(country !== undefined ? { country } : {}),
      },
      include: {
        artist: { select: { id: true, name: true } },
        _count: { select: { tracks: true } },
      },
    });

    res.json({
      data: {
        ...album,
        releaseDate: album.releaseDate?.toISOString() ?? null,
        createdAt: album.createdAt.toISOString(),
        trackCount: album._count.tracks,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─── PUT /api/albums/:id/metadata (Admin) ──────────────────────────────────

router.put('/:id/metadata', requireAdmin, async (req, res, next) => {
  try {
    const parsed = albumMetadataSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const album = await prisma.album.findUnique({
      where: { id: String(req.params.id) },
      include: {
        artist: true,
        tracks: { select: { id: true, filePath: true } },
      },
    });
    if (!album) {
      res.status(404).json({ error: 'Album not found' });
      return;
    }

    const input = parsed.data;

    // Resolve artist if name changed
    let artistId = album.artistId;
    if (input.artistName && input.artistName !== album.artist.name) {
      const existing = await prisma.artist.findFirst({
        where: { name: input.artistName },
        select: { id: true },
      });
      if (existing) {
        artistId = existing.id;
      } else {
        const created = await prisma.artist.create({
          data: { name: input.artistName },
          select: { id: true },
        });
        artistId = created.id;
      }
    }

    // Update album in DB
    const updated = await prisma.album.update({
      where: { id: album.id },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.year !== undefined ? { year: input.year } : {}),
        ...(input.genre !== undefined ? { genre: input.genre } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.musicbrainzId ? { musicbrainzId: input.musicbrainzId } : {}),
        artistId,
      },
      include: {
        artist: { select: { id: true, name: true } },
        _count: { select: { tracks: true } },
      },
    });

    // Update all tracks in album: write artist/album/year/genre tags to files
    const tagFields = {
      artist: input.artistName,
      album: input.title,
      year: input.year,
      genre: input.genre,
    };
    const tagUpdates = Object.fromEntries(
      Object.entries(tagFields).filter(([, v]) => v !== undefined),
    );

    if (Object.keys(tagUpdates).length > 0) {
      for (const track of album.tracks) {
        if (artistId !== album.artistId) {
          await prisma.track.update({
            where: { id: track.id },
            data: { artistId },
          });
        }
        await writeTags(track.filePath, tagUpdates);
      }
    }

    res.json({
      data: {
        ...updated,
        releaseDate: updated.releaseDate?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
        trackCount: updated._count.tracks,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─── POST /api/albums/:id/cover (Admin) ────────────────────────────────────

router.post('/:id/cover', requireAdmin, upload.single('cover'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No cover image uploaded. Use field name "cover".' });
      return;
    }

    const album = await prisma.album.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true },
    });
    if (!album) {
      res.status(404).json({ error: 'Album not found' });
      return;
    }

    const covers = await processAndSaveCover(req.file.buffer, album.id);

    await prisma.album.update({
      where: { id: album.id },
      data: { coverUrl: covers.url500 },
    });

    res.json({ data: covers });
  } catch (error) {
    next(error);
  }
});

// ─── POST /api/albums/:id/match-musicbrainz ─────────────────────────────────

router.post('/:id/match-musicbrainz', async (req, res, next) => {
  try {
    const parsed = matchMusicbrainzSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const album = await prisma.album.findUnique({
      where: { id: String(req.params.id) },
      include: {
        artist: true,
        tracks: {
          select: { id: true, filePath: true, trackNumber: true, discNumber: true, title: true },
          orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
        },
      },
    });
    if (!album) {
      res.status(404).json({ error: 'Album not found' });
      return;
    }

    const { musicbrainzReleaseId, confirm } = parsed.data;

    logger.info(`MusicBrainz match for album "${album.title}" (${album.id}) → release ${musicbrainzReleaseId}, confirm=${confirm}`);

    // Fetch MusicBrainz release data
    const release = await getReleaseById(musicbrainzReleaseId);
    const coverUrl = await getCoverArtUrl(musicbrainzReleaseId);

    // Build the preview of changes
    const artistName = release['artist-credit']
      ?.map((c) => c.name + (c.joinphrase || ''))
      .join('') ?? album.artist.name;
    const releaseYear = release.date ? parseInt(release.date.slice(0, 4), 10) : null;
    const label = release['label-info']?.[0]?.label?.name ?? null;
    const country = release.country ?? null;
    const genre = release.tags?.sort((a, b) => b.count - a.count)[0]?.name ?? null;
    const totalDiscs = release.media?.length ?? null;

    // Build track-level changes from MusicBrainz media
    const mbTracks = release.media?.flatMap((m) =>
      (m.tracks ?? []).map((t) => ({
        discNumber: m.position,
        trackNumber: t.position,
        title: t.title,
        duration: t.length ? t.length / 1000 : null,
        musicbrainzId: t.recording.id,
      })),
    ) ?? [];

    const changes = {
      album: {
        title: { from: album.title, to: release.title },
        artistName: { from: album.artist.name, to: artistName },
        year: { from: album.year, to: releaseYear },
        genre: { from: album.genre, to: genre },
        label: { from: album.label, to: label },
        country: { from: album.country, to: country },
        totalDiscs: { from: album.totalDiscs, to: totalDiscs },
        coverUrl: { from: album.coverUrl, to: coverUrl },
        musicbrainzId: { from: album.musicbrainzId, to: musicbrainzReleaseId },
      },
      tracks: mbTracks,
    };

    if (!confirm) {
      res.json({ data: { preview: true, changes } });
      return;
    }

    // ── Apply changes ──────────────────────────────────────────────────────

    // Resolve artist
    let artistId = album.artistId;
    if (artistName !== album.artist.name) {
      const existing = await prisma.artist.findFirst({
        where: { name: artistName },
        select: { id: true },
      });
      artistId = existing
        ? existing.id
        : (await prisma.artist.create({
            data: { name: artistName },
            select: { id: true },
          })).id;
    }

    // Download and save cover art locally (instead of storing the remote URL)
    let localCoverUrl: string | null = null;
    if (coverUrl) {
      const saved = await downloadAndSaveCover(coverUrl, album.id);
      if (saved) {
        localCoverUrl = saved.url500;
        logger.info(`Downloaded cover art for album ${album.id} from MusicBrainz`);
      } else {
        logger.warn(`Could not download cover art for album ${album.id} from ${coverUrl}`);
      }
    }

    // Check if the MusicBrainz release ID is already linked to a different album
    const mbAlbumAlreadyClaimed = await prisma.album.findUnique({
      where: { musicbrainzId: musicbrainzReleaseId },
      select: { id: true, title: true },
    });
    if (mbAlbumAlreadyClaimed && mbAlbumAlreadyClaimed.id !== album.id) {
      res.status(409).json({
        error: `This MusicBrainz release is already linked to another album: "${mbAlbumAlreadyClaimed.title}"`,
      });
      return;
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
    let tracksUpdated = 0;
    let tracksSkipped = 0;
    for (const mbTrack of mbTracks) {
      const localTrack = album.tracks.find(
        (t) =>
          t.discNumber === mbTrack.discNumber && t.trackNumber === mbTrack.trackNumber,
      ) ?? album.tracks.find(
        // Fallback: match by trackNumber only (single-disc albums or missing disc info)
        (t) => t.trackNumber === mbTrack.trackNumber && (album.tracks.every((tr) => tr.discNumber === 1 || tr.discNumber === null)),
      );
      if (!localTrack) {
        tracksSkipped++;
        logger.debug(`No local track for disc ${mbTrack.discNumber} track ${mbTrack.trackNumber} — skipped`);
        continue;
      }

      // Only set musicbrainzId if it is not already claimed by another track
      const mbTrackAlreadyClaimed = mbTrack.musicbrainzId
        ? await prisma.track.findUnique({
            where: { musicbrainzId: mbTrack.musicbrainzId },
            select: { id: true },
          })
        : null;

      await prisma.track.update({
        where: { id: localTrack.id },
        data: {
          title: mbTrack.title,
          artistId,
          ...(!mbTrackAlreadyClaimed ? { musicbrainzId: mbTrack.musicbrainzId } : {}),
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
        logger.warn(`Failed to write tags for track ${localTrack.id} at ${localTrack.filePath}`, { error: String(err) });
      }
      tracksUpdated++;
    }

    logger.info(`MusicBrainz match applied for album ${album.id}: ${tracksUpdated} tracks updated, ${tracksSkipped} skipped`);

    // Update changes object with the actual local cover URL for the response
    if (localCoverUrl) {
      changes.album.coverUrl = { from: album.coverUrl, to: localCoverUrl };
    }

    res.json({ data: { preview: false, applied: true, changes } });
  } catch (error) {
    logger.error('MusicBrainz match failed', { albumId: req.params.id, error: String(error) });
    next(error);
  }
});

// ─── GET /api/albums/:id/musicbrainz-candidates ────────────────────────────

router.get('/:id/musicbrainz-candidates', async (req, res, next) => {
  try {
    const album = await prisma.album.findUnique({
      where: { id: String(req.params.id) },
      include: {
        artist: { select: { name: true } },
        _count: { select: { tracks: true } },
      },
    });
    if (!album) {
      res.status(404).json({ error: 'Album not found' });
      return;
    }

    const result = await matchAlbum({
      title: album.title,
      artistName: album.artist.name,
      year: album.year,
      trackCount: album._count.tracks,
    });

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
