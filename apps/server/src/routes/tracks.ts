import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../config/database.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { trackMetadataSchema } from './schemas/metadata.schemas.js';
import { writeTags } from '../services/metadata/tagwriter.service.js';
import type { PaginatedResponse, TrackWithRelations } from '@musicserver/shared';

const router: Router = Router();

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
    const skip = (page - 1) * pageSize;
    const sort = (req.query.sort as string) || 'title';

    const orderBy =
      sort === 'newest' ? { createdAt: 'desc' as const } : { title: 'asc' as const };

    const [tracks, total] = await Promise.all([
      prisma.track.findMany({
        skip,
        take: pageSize,
        include: {
          artist: { select: { id: true, name: true } },
          album: { select: { id: true, title: true, coverUrl: true, year: true, label: true } },
        },
        orderBy,
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
      where: { id: String(req.params.id) },
      include: {
        artist: { select: { id: true, name: true } },
        album: { select: { id: true, title: true, coverUrl: true, year: true, label: true } },
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

/** Update track metadata */
router.patch('/:id', async (req, res, next) => {
  try {
    const { title, trackNumber, discNumber, lyrics } = req.body;

    const track = await prisma.track.update({
      where: { id: String(req.params.id) },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(trackNumber !== undefined ? { trackNumber } : {}),
        ...(discNumber !== undefined ? { discNumber } : {}),
        ...(lyrics !== undefined ? { lyrics } : {}),
      },
      include: {
        artist: { select: { id: true, name: true } },
        album: { select: { id: true, title: true, coverUrl: true, year: true, label: true } },
      },
    });

    res.json({ data: track });
  } catch (error) {
    next(error);
  }
});

/** Update track metadata (admin only) — writes tags back to file */
router.put('/:id/metadata', requireAdmin, async (req, res, next) => {
  try {
    const parsed = trackMetadataSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const track = await prisma.track.findUnique({
      where: { id: String(req.params.id) },
      include: { artist: true, album: true },
    });
    if (!track) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    const input = parsed.data;

    // Resolve artist — find or create if artistName changed
    let artistId = track.artistId;
    if (input.artistName && input.artistName !== track.artist.name) {
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

    // Resolve album — find or create if albumName changed
    let albumId = track.albumId;
    if (input.albumName !== undefined) {
      if (input.albumName) {
        const existing = await prisma.album.findFirst({
          where: { title: input.albumName, artistId },
          select: { id: true },
        });
        if (existing) {
          albumId = existing.id;
        } else {
          const created = await prisma.album.create({
            data: { title: input.albumName, artistId },
            select: { id: true },
          });
          albumId = created.id;
        }
      } else {
        albumId = null;
      }
    }

    // Update database
    const updated = await prisma.track.update({
      where: { id: track.id },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.trackNumber ? { trackNumber: input.trackNumber } : {}),
        ...(input.discNumber ? { discNumber: input.discNumber } : {}),
        ...(input.lyrics !== undefined ? { lyrics: input.lyrics } : {}),
        artistId,
        albumId,
      },
      include: {
        artist: { select: { id: true, name: true } },
        album: { select: { id: true, title: true, coverUrl: true, year: true, label: true } },
      },
    });

    // Write tags to audio file
    await writeTags(track.filePath, {
      title: input.title,
      artist: input.artistName,
      album: input.albumName,
      trackNumber: input.trackNumber,
      discNumber: input.discNumber,
      year: input.year,
      genre: input.genre,
      lyrics: input.lyrics,
    });

    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
});

/** Stream audio file */
router.get('/:id/stream', async (req, res, next) => {
  try {
    const track = await prisma.track.findUnique({
      where: { id: String(req.params.id) },
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
