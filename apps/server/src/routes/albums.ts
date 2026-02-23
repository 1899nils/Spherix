import { Router } from 'express';
import { prisma } from '../config/database.js';
import type { AlbumWithRelations, PaginatedResponse } from '@musicserver/shared';

const router: Router = Router();

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

    const data: AlbumWithRelations[] = albums.map((a) => ({
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
      where: { id: req.params.id },
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

    const tracks = album.tracks.map((t) => ({
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
      where: { id: req.params.id },
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

export default router;
