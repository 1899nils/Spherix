import { Router } from 'express';
import { prisma } from '../config/database.js';
import type { ArtistWithRelations, AlbumWithRelations, PaginatedResponse } from '@musicserver/shared';

const router: Router = Router();

/** List all artists with pagination */
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50));
    const skip = (page - 1) * pageSize;

    const where = {
      OR: [
        { albums: { some: {} } },
        { tracks: { some: {} } },
      ],
    };

    const [artists, total] = await Promise.all([
      prisma.artist.findMany({
        skip,
        take: pageSize,
        where,
        include: {
          _count: { select: { albums: true, tracks: true } },
        },
        orderBy: { sortName: 'asc' },
      }),
      prisma.artist.count({ where }),
    ]);

    const data: ArtistWithRelations[] = artists.map((a: typeof artists[number]) => ({
      id: a.id,
      name: a.name,
      sortName: a.sortName,
      biography: a.biography,
      imageUrl: a.imageUrl,
      musicbrainzId: a.musicbrainzId,
      externalIds: a.externalIds as Record<string, string> | null,
      albumCount: a._count.albums,
      trackCount: a._count.tracks,
    }));

    const response: PaginatedResponse<ArtistWithRelations> = {
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

/** Get artist detail with albums and top tracks */
router.get('/:id', async (req, res, next) => {
  try {
    const artist = await prisma.artist.findUnique({
      where: { id: String(req.params.id) },
      include: {
        _count: { select: { albums: true, tracks: true } },
        albums: {
          include: {
            _count: { select: { tracks: true } },
          },
          orderBy: { year: 'desc' },
        },
        tracks: {
          take: 10,
          orderBy: { trackNumber: 'asc' },
          include: {
            artist: { select: { id: true, name: true } },
            album: { select: { id: true, title: true, coverUrl: true, year: true, label: true } },
          },
        },
      },
    });

    if (!artist) {
      res.status(404).json({ error: 'Artist not found', statusCode: 404 });
      return;
    }

    const albums: AlbumWithRelations[] = artist.albums.map((a: typeof artist.albums[number]) => ({
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
      artist: { id: artist.id, name: artist.name },
      trackCount: a._count.tracks,
    }));

    const tracks = artist.tracks.map((t: typeof artist.tracks[number]) => ({
      ...t,
      fileSize: t.fileSize.toString(),
      createdAt: t.createdAt.toISOString(),
    }));

    res.json({
      data: {
        id: artist.id,
        name: artist.name,
        sortName: artist.sortName,
        biography: artist.biography,
        imageUrl: artist.imageUrl,
        musicbrainzId: artist.musicbrainzId,
        externalIds: artist.externalIds as Record<string, string> | null,
        albumCount: artist._count.albums,
        trackCount: artist._count.tracks,
        albums,
        tracks,
      },
    });
  } catch (error) {
    next(error);
  }
});

/** Fetch artist metadata from TheAudioDB (biography + image) and persist */
router.post('/:id/fetch-metadata', async (req, res, next) => {
  try {
    const artist = await prisma.artist.findUnique({ where: { id: String(req.params.id) } });
    if (!artist) {
      res.status(404).json({ error: 'Artist not found' });
      return;
    }

    type AudioDBEntry = {
      strBiographyDE?: string;
      strBiographyEN?: string;
      strArtistThumb?: string;
    };

    let entry: AudioDBEntry | null = null;

    // Prefer lookup by MusicBrainz ID for best accuracy
    if (artist.musicbrainzId) {
      const url = `https://www.theaudiodb.com/api/v1/json/2/artist-mb.php?i=${encodeURIComponent(artist.musicbrainzId)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (r.ok) {
        const json = await r.json() as { artists?: AudioDBEntry[] };
        entry = json.artists?.[0] ?? null;
      }
    }

    // Fallback: search by name
    if (!entry) {
      const url = `https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(artist.name)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (r.ok) {
        const json = await r.json() as { artists?: AudioDBEntry[] };
        entry = json.artists?.[0] ?? null;
      }
    }

    if (!entry) {
      res.status(404).json({ error: 'Keine Metadaten bei TheAudioDB gefunden' });
      return;
    }

    const biography = entry.strBiographyDE || entry.strBiographyEN || null;
    const imageUrl = entry.strArtistThumb || null;

    const updated = await prisma.artist.update({
      where: { id: String(req.params.id) },
      data: {
        ...(biography ? { biography } : {}),
        ...(imageUrl ? { imageUrl } : {}),
      },
      include: { _count: { select: { albums: true, tracks: true } } },
    });

    res.json({
      data: {
        id: updated.id,
        name: updated.name,
        sortName: updated.sortName,
        biography: updated.biography,
        imageUrl: updated.imageUrl,
        musicbrainzId: updated.musicbrainzId,
        externalIds: updated.externalIds as Record<string, string> | null,
        albumCount: updated._count.albums,
        trackCount: updated._count.tracks,
      },
    });
  } catch (error) {
    next(error);
  }
});

/** Update artist metadata */
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, biography, imageUrl } = req.body;

    const artist = await prisma.artist.update({
      where: { id: String(req.params.id) },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(biography !== undefined ? { biography } : {}),
        ...(imageUrl !== undefined ? { imageUrl } : {}),
      },
      include: {
        _count: { select: { albums: true, tracks: true } },
      },
    });

    res.json({
      data: {
        ...artist,
        externalIds: artist.externalIds as Record<string, string> | null,
        albumCount: artist._count.albums,
        trackCount: artist._count.tracks,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
