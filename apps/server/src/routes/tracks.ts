import { Router } from 'express';
import { prisma } from '../config/database.js';
import type { PaginatedResponse, TrackWithRelations } from '@musicserver/shared';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const skip = (page - 1) * pageSize;

    const [tracks, total] = await Promise.all([
      prisma.track.findMany({
        skip,
        take: pageSize,
        include: {
          artist: { select: { id: true, name: true } },
          album: { select: { id: true, title: true, coverUrl: true } },
        },
        orderBy: { title: 'asc' },
      }),
      prisma.track.count(),
    ]);

    const response: PaginatedResponse<TrackWithRelations> = {
      data: tracks as unknown as TrackWithRelations[],
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

router.get('/:id', async (req, res, next) => {
  try {
    const track = await prisma.track.findUnique({
      where: { id: req.params.id },
      include: {
        artist: { select: { id: true, name: true } },
        album: { select: { id: true, title: true, coverUrl: true } },
      },
    });

    if (!track) {
      res.status(404).json({ error: 'Track not found', statusCode: 404 });
      return;
    }

    res.json({ data: track });
  } catch (error) {
    next(error);
  }
});

export default router;
