import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { sendResponse, sendError, SubsonicError } from '../response.js';

const router = Router();

// ─── star ───────────────────────────────────────────────────────────────────

async function handleStar(req: import('express').Request, res: import('express').Response) {
  const userId = req.subsonicUser?.id;
  if (!userId) {
    sendError(req, res, SubsonicError.NOT_AUTHORIZED, 'Authentication required');
    return;
  }

  // Subsonic sends id, albumId, artistId as query params (can be repeated)
  const ids = asArray(req.query.id);
  const albumIds = asArray(req.query.albumId);
  const artistIds = asArray(req.query.artistId);

  const operations: Promise<unknown>[] = [];

  for (const trackId of ids) {
    operations.push(
      prisma.starredTrack.upsert({
        where: { userId_trackId: { userId, trackId } },
        create: { userId, trackId },
        update: {},
      }),
    );
  }

  for (const albumId of albumIds) {
    operations.push(
      prisma.starredAlbum.upsert({
        where: { userId_albumId: { userId, albumId } },
        create: { userId, albumId },
        update: {},
      }),
    );
  }

  for (const artistId of artistIds) {
    operations.push(
      prisma.starredArtist.upsert({
        where: { userId_artistId: { userId, artistId } },
        create: { userId, artistId },
        update: {},
      }),
    );
  }

  await Promise.all(operations);
  sendResponse(req, res);
}

router.get('/star', handleStar);
router.post('/star', handleStar);

// ─── unstar ─────────────────────────────────────────────────────────────────

async function handleUnstar(req: import('express').Request, res: import('express').Response) {
  const userId = req.subsonicUser?.id;
  if (!userId) {
    sendError(req, res, SubsonicError.NOT_AUTHORIZED, 'Authentication required');
    return;
  }

  const ids = asArray(req.query.id);
  const albumIds = asArray(req.query.albumId);
  const artistIds = asArray(req.query.artistId);

  const operations: Promise<unknown>[] = [];

  for (const trackId of ids) {
    operations.push(
      prisma.starredTrack.deleteMany({
        where: { userId, trackId },
      }),
    );
  }

  for (const albumId of albumIds) {
    operations.push(
      prisma.starredAlbum.deleteMany({
        where: { userId, albumId },
      }),
    );
  }

  for (const artistId of artistIds) {
    operations.push(
      prisma.starredArtist.deleteMany({
        where: { userId, artistId },
      }),
    );
  }

  await Promise.all(operations);
  sendResponse(req, res);
}

router.get('/unstar', handleUnstar);
router.post('/unstar', handleUnstar);

// ─── scrobble ───────────────────────────────────────────────────────────────

async function handleScrobble(req: import('express').Request, res: import('express').Response) {
  const userId = req.subsonicUser?.id;
  if (!userId) {
    sendError(req, res, SubsonicError.NOT_AUTHORIZED, 'Authentication required');
    return;
  }

  const id = req.query.id as string;
  if (!id) {
    sendError(req, res, SubsonicError.MISSING_PARAMETER, 'Required parameter "id" is missing');
    return;
  }

  const submission = req.query.submission !== 'false'; // default true

  if (submission) {
    await prisma.playHistory.create({
      data: {
        userId,
        trackId: id,
        completed: true,
      },
    });
  }

  sendResponse(req, res);
}

router.get('/scrobble', handleScrobble);
router.post('/scrobble', handleScrobble);

// ─── getStarred2 ────────────────────────────────────────────────────────────

async function handleGetStarred2(req: import('express').Request, res: import('express').Response) {
  const userId = req.subsonicUser?.id;
  if (!userId) {
    sendError(req, res, SubsonicError.NOT_AUTHORIZED, 'Authentication required');
    return;
  }

  const [starredArtists, starredAlbums, starredTracks] = await Promise.all([
    prisma.starredArtist.findMany({
      where: { userId },
      include: {
        artist: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            _count: { select: { albums: true } },
          },
        },
      },
    }),
    prisma.starredAlbum.findMany({
      where: { userId },
      include: {
        album: {
          include: {
            artist: { select: { id: true, name: true } },
            _count: { select: { tracks: true } },
            tracks: { select: { duration: true } },
          },
        },
      },
    }),
    prisma.starredTrack.findMany({
      where: { userId },
      include: {
        track: {
          include: {
            artist: { select: { id: true, name: true } },
            album: { select: { id: true, title: true, coverUrl: true, year: true, genre: true } },
          },
        },
      },
    }),
  ]);

  const suffix = (format: string) => format?.replace('.', '') || 'mp3';
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg', flac: 'audio/flac', ogg: 'audio/ogg',
    opus: 'audio/opus', m4a: 'audio/mp4', wav: 'audio/wav',
  };

  sendResponse(req, res, {
    starred2: {
      artist: starredArtists.map((sa) => ({
        id: sa.artist.id,
        name: sa.artist.name,
        coverArt: sa.artist.imageUrl ? sa.artist.id : undefined,
        albumCount: sa.artist._count.albums,
        starred: sa.starredAt.toISOString(),
      })),
      album: starredAlbums.map((sa) => {
        const al = sa.album;
        const totalDuration = al.tracks.reduce((sum, t) => sum + t.duration, 0);
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
          starred: sa.starredAt.toISOString(),
        };
      }),
      song: starredTracks.map((st) => {
        const t = st.track;
        const s = suffix(t.format);
        const albumData = t.album as { id: string; title: string; coverUrl: string | null; year?: number | null; genre?: string | null } | null;
        return {
          id: t.id,
          parent: albumData?.id ?? t.artist?.id ?? '',
          isDir: false,
          title: t.title,
          album: albumData?.title,
          artist: t.artist?.name,
          track: t.trackNumber,
          discNumber: t.discNumber,
          year: albumData?.year ?? undefined,
          genre: albumData?.genre ?? undefined,
          coverArt: albumData?.id,
          size: Number(t.fileSize),
          contentType: mimeMap[s] || 'application/octet-stream',
          suffix: s,
          duration: Math.round(t.duration),
          bitRate: t.bitrate ?? undefined,
          path: t.filePath.replace(/^\/music\//, ''),
          isVideo: false,
          type: 'music',
          created: t.createdAt.toISOString(),
          albumId: albumData?.id,
          artistId: t.artist?.id,
          starred: st.starredAt.toISOString(),
        };
      }),
    },
  });
}

router.get('/getStarred2', handleGetStarred2);
router.post('/getStarred2', handleGetStarred2);
router.get('/getStarred', handleGetStarred2);
router.post('/getStarred', handleGetStarred2);

// ─── Helper ─────────────────────────────────────────────────────────────────

function asArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  return [String(val)];
}

export default router;
