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

    const [artists, total] = await Promise.all([
      prisma.artist.findMany({
        skip,
        take: pageSize,
        include: {
          _count: { select: { albums: true, tracks: true } },
        },
        orderBy: { sortName: 'asc' },
      }),
      prisma.artist.count(),
    ]);

    const data: ArtistWithRelations[] = artists.map((a) => ({
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

/** Get artist detail with albums */
router.get('/:id', async (req, res, next) => {
  try {
    const artist = await prisma.artist.findUnique({
      where: { id: req.params.id },
      include: {
        _count: { select: { albums: true, tracks: true } },
        albums: {
          include: {
            _count: { select: { tracks: true } },
          },
          orderBy: { year: 'desc' },
        },
      },
    });

    if (!artist) {
      res.status(404).json({ error: 'Artist not found', statusCode: 404 });
      return;
    }

    const albums: AlbumWithRelations[] = artist.albums.map((a) => ({
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
      where: { id: req.params.id },
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
