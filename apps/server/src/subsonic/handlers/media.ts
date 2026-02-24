import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../config/database.js';
import { sendError, SubsonicError } from '../response.js';

const router = Router();

// ─── stream ─────────────────────────────────────────────────────────────────

async function handleStream(req: import('express').Request, res: import('express').Response) {
  const id = req.query.id as string;
  if (!id) {
    sendError(req, res, SubsonicError.MISSING_PARAMETER, 'Required parameter "id" is missing');
    return;
  }

  const track = await prisma.track.findUnique({
    where: { id },
    select: { filePath: true, format: true, fileSize: true },
  });

  if (!track) {
    sendError(req, res, SubsonicError.NOT_FOUND, 'Song not found');
    return;
  }

  if (!fs.existsSync(track.filePath)) {
    sendError(req, res, SubsonicError.NOT_FOUND, 'Audio file not found on disk');
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
}

router.get('/stream', handleStream);
router.post('/stream', handleStream);

// ─── getCoverArt ────────────────────────────────────────────────────────────

async function handleGetCoverArt(req: import('express').Request, res: import('express').Response) {
  const id = req.query.id as string;
  if (!id) {
    sendError(req, res, SubsonicError.MISSING_PARAMETER, 'Required parameter "id" is missing');
    return;
  }

  const size = parseInt(req.query.size as string) || undefined;

  // Try album first
  const album = await prisma.album.findUnique({
    where: { id },
    select: { coverUrl: true },
  });

  let coverPath: string | null = null;

  if (album?.coverUrl) {
    // coverUrl is like /api/covers/{albumId}/cover-500.jpg or /api/covers/{hash}.jpg
    // Strip the /api/covers/ prefix to get the file path under /data/covers/
    coverPath = path.join('/data/covers', album.coverUrl.replace(/^\/api\/covers\//, ''));
  }

  if (!coverPath || !fs.existsSync(coverPath)) {
    // Try as artist
    const artist = await prisma.artist.findUnique({
      where: { id },
      select: { imageUrl: true },
    });

    if (artist?.imageUrl) {
      coverPath = path.join('/data/covers', artist.imageUrl.replace(/^\/api\/covers\//, ''));
    }
  }

  if (!coverPath || !fs.existsSync(coverPath)) {
    // Try to find cover from a track's album
    const track = await prisma.track.findUnique({
      where: { id },
      select: { album: { select: { coverUrl: true } } },
    });

    if (track?.album?.coverUrl) {
      coverPath = path.join('/data/covers', track.album.coverUrl.replace(/^\/api\/covers\//, ''));
    }
  }

  if (!coverPath || !fs.existsSync(coverPath)) {
    res.status(404).send('Cover art not found');
    return;
  }

  const ext = path.extname(coverPath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };

  res.set({
    'Content-Type': mimeTypes[ext] || 'image/jpeg',
    'Cache-Control': 'public, max-age=604800, immutable',
  });

  // If size is requested and we have cover-300 available, prefer smaller variant
  if (size && size <= 300) {
    const smallPath = coverPath.replace('cover-500.jpg', 'cover-300.jpg');
    if (fs.existsSync(smallPath)) {
      fs.createReadStream(smallPath).pipe(res);
      return;
    }
  }

  fs.createReadStream(coverPath).pipe(res);
}

router.get('/getCoverArt', handleGetCoverArt);
router.post('/getCoverArt', handleGetCoverArt);

export default router;
