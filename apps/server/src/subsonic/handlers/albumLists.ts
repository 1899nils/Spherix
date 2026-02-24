import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { sendResponse, sendError, SubsonicError } from '../response.js';

const router = Router();

// ─── getAlbumList2 (ID3-based album list) ───────────────────────────────────

async function handleGetAlbumList2(req: import('express').Request, res: import('express').Response) {
  const type = req.query.type as string;
  if (!type) {
    sendError(req, res, SubsonicError.MISSING_PARAMETER, 'Required parameter "type" is missing');
    return;
  }

  const size = Math.min(parseInt(req.query.size as string) || 10, 500);
  const offset = parseInt(req.query.offset as string) || 0;
  const fromYear = parseInt(req.query.fromYear as string) || undefined;
  const toYear = parseInt(req.query.toYear as string) || undefined;
  const genre = req.query.genre as string | undefined;
  const userId = req.subsonicUser?.id;

  let orderBy: Record<string, unknown> = {};
  let where: Record<string, unknown> = {};

  switch (type) {
    case 'newest':
      orderBy = { createdAt: 'desc' };
      break;
    case 'random':
      // Prisma doesn't support random ordering directly — we'll handle this specially
      break;
    case 'alphabeticalByName':
      orderBy = { title: 'asc' };
      break;
    case 'alphabeticalByArtist':
      orderBy = { artist: { name: 'asc' } };
      break;
    case 'frequent':
    case 'recent':
      orderBy = { createdAt: 'desc' };
      break;
    case 'starred':
      // Only return starred albums
      if (!userId) {
        sendError(req, res, SubsonicError.NOT_AUTHORIZED, 'Authentication required for starred');
        return;
      }
      where = { starredAlbums: { some: { userId } } };
      orderBy = { title: 'asc' };
      break;
    case 'byYear':
      if (fromYear !== undefined && toYear !== undefined) {
        where = {
          year: {
            gte: Math.min(fromYear, toYear),
            lte: Math.max(fromYear, toYear),
          },
        };
        orderBy = { year: fromYear <= toYear ? 'asc' : 'desc' };
      } else {
        orderBy = { year: 'desc' };
      }
      break;
    case 'byGenre':
      if (genre) {
        where = { genre: { equals: genre, mode: 'insensitive' } };
      }
      orderBy = { title: 'asc' };
      break;
    default:
      orderBy = { title: 'asc' };
  }

  let albums;

  if (type === 'random') {
    // For random: fetch IDs first, then shuffle
    const allIds = await prisma.album.findMany({
      select: { id: true },
    });
    // Fisher-Yates shuffle
    for (let i = allIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allIds[i], allIds[j]] = [allIds[j], allIds[i]];
    }
    const selectedIds = allIds.slice(0, size).map((a) => a.id);

    albums = await prisma.album.findMany({
      where: { id: { in: selectedIds } },
      include: {
        artist: { select: { id: true, name: true } },
        _count: { select: { tracks: true } },
        tracks: { select: { duration: true } },
        ...(userId
          ? { starredAlbums: { where: { userId }, take: 1 } }
          : {}),
      },
    });
  } else {
    albums = await prisma.album.findMany({
      where,
      skip: offset,
      take: size,
      orderBy: orderBy as any,
      include: {
        artist: { select: { id: true, name: true } },
        _count: { select: { tracks: true } },
        tracks: { select: { duration: true } },
        ...(userId
          ? { starredAlbums: { where: { userId }, take: 1 } }
          : {}),
      },
    });
  }

  sendResponse(req, res, {
    albumList2: {
      album: albums.map((al) => {
        const totalDuration = al.tracks.reduce((sum, t) => sum + t.duration, 0);
        const starred = (al as unknown as { starredAlbums?: { starredAt: Date }[] }).starredAlbums?.[0];
        return {
          id: al.id,
          name: al.title,
          artist: al.artist.name,
          artistId: al.artist.id,
          coverArt: al.id,
          songCount: al._count.tracks,
          duration: Math.round(totalDuration),
          created: al.createdAt.toISOString(),
          year: al.year ?? undefined,
          genre: al.genre ?? undefined,
          ...(starred ? { starred: starred.starredAt.toISOString() } : {}),
        };
      }),
    },
  });
}

router.get('/getAlbumList2', handleGetAlbumList2);
router.post('/getAlbumList2', handleGetAlbumList2);

// getAlbumList — non-ID3 variant (same implementation)
router.get('/getAlbumList', handleGetAlbumList2);
router.post('/getAlbumList', handleGetAlbumList2);

export default router;
