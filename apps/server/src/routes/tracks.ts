import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../config/database.js';
import type { PaginatedResponse, TrackWithRelations } from '@musicserver/shared';

const router: Router = Router();

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

/** Stream audio file */
router.get('/:id/stream', async (req, res, next) => {
  try {
    const track = await prisma.track.findUnique({
      where: { id: req.params.id },
      select: { filePath: true, format: true, fileSize: true },
    });

    if (!track) {
      res.status(404).json({ error: 'Track not found', statusCode: 404 });
      return;
    }

    // Verify file exists
    if (!fs.existsSync(track.filePath)) {
      res.status(404).json({ error: 'Audio file not found on disk', statusCode: 404 });
      return;
    }

    const stat = fs.statSync(track.filePath);
    const fileSize = stat.size;
    const ext = path.extname(track.filePath).toLowerCase();

    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.wav': 'audio/wav',
      '.aiff': 'audio/aiff',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });

      fs.createReadStream(track.filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });

      fs.createReadStream(track.filePath).pipe(res);
    }
  } catch (error) {
    next(error);
  }
});

export default router;
