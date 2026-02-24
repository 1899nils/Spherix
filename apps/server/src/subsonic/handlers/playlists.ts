import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { sendResponse, sendError, SubsonicError } from '../response.js';

const router = Router();

// ─── Helper: format a track as a Subsonic song entry ────────────────────────

function formatPlaylistSong(t: {
  id: string;
  title: string;
  trackNumber: number;
  discNumber: number;
  duration: number;
  filePath: string;
  fileSize: bigint;
  format: string;
  bitrate: number | null;
  createdAt: Date;
  musicbrainzId: string | null;
  artist: { id: string; name: string } | null;
  album: { id: string; title: string; coverUrl: string | null; year?: number | null; genre?: string | null } | null;
}) {
  const suffix = t.format?.replace('.', '') || 'mp3';
  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg', flac: 'audio/flac', ogg: 'audio/ogg',
    opus: 'audio/opus', m4a: 'audio/mp4', wav: 'audio/wav',
  };
  return {
    id: t.id,
    parent: t.album?.id ?? t.artist?.id ?? '',
    isDir: false,
    title: t.title,
    album: t.album?.title,
    artist: t.artist?.name,
    track: t.trackNumber,
    discNumber: t.discNumber,
    year: t.album?.year ?? undefined,
    genre: t.album?.genre ?? undefined,
    coverArt: t.album?.id,
    size: Number(t.fileSize),
    contentType: mimeMap[suffix] || 'application/octet-stream',
    suffix,
    duration: Math.round(t.duration),
    bitRate: t.bitrate ?? undefined,
    path: t.filePath.replace(/^\/music\//, ''),
    isVideo: false,
    type: 'music',
    created: t.createdAt.toISOString(),
    albumId: t.album?.id,
    artistId: t.artist?.id,
  };
}

// ─── getPlaylists ───────────────────────────────────────────────────────────

async function handleGetPlaylists(req: import('express').Request, res: import('express').Response) {
  const userId = req.subsonicUser?.id;
  if (!userId) {
    sendError(req, res, SubsonicError.NOT_AUTHORIZED, 'Authentication required');
    return;
  }

  const playlists = await prisma.playlist.findMany({
    where: {
      OR: [
        { userId },
        { isPublic: true },
      ],
    },
    include: {
      user: { select: { username: true } },
      _count: { select: { tracks: true } },
      tracks: {
        include: { track: { select: { duration: true } } },
      },
    },
    orderBy: { name: 'asc' },
  });

  sendResponse(req, res, {
    playlists: {
      playlist: playlists.map((pl) => {
        const totalDuration = pl.tracks.reduce((sum, pt) => sum + pt.track.duration, 0);
        return {
          id: pl.id,
          name: pl.name,
          songCount: pl._count.tracks,
          duration: Math.round(totalDuration),
          public: pl.isPublic,
          owner: pl.user.username,
          created: pl.createdAt.toISOString(),
          changed: pl.createdAt.toISOString(),
        };
      }),
    },
  });
}

router.get('/getPlaylists', handleGetPlaylists);
router.post('/getPlaylists', handleGetPlaylists);

// ─── getPlaylist ────────────────────────────────────────────────────────────

async function handleGetPlaylist(req: import('express').Request, res: import('express').Response) {
  const id = req.query.id as string;
  if (!id) {
    sendError(req, res, SubsonicError.MISSING_PARAMETER, 'Required parameter "id" is missing');
    return;
  }

  const userId = req.subsonicUser?.id;

  const playlist = await prisma.playlist.findUnique({
    where: { id },
    include: {
      user: { select: { username: true } },
      tracks: {
        include: {
          track: {
            include: {
              artist: { select: { id: true, name: true } },
              album: { select: { id: true, title: true, coverUrl: true, year: true, genre: true } },
            },
          },
        },
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!playlist) {
    sendError(req, res, SubsonicError.NOT_FOUND, 'Playlist not found');
    return;
  }

  // Check access
  if (!playlist.isPublic && playlist.userId !== userId) {
    sendError(req, res, SubsonicError.NOT_AUTHORIZED, 'Not authorized to access this playlist');
    return;
  }

  const totalDuration = playlist.tracks.reduce((sum, pt) => sum + pt.track.duration, 0);

  sendResponse(req, res, {
    playlist: {
      id: playlist.id,
      name: playlist.name,
      songCount: playlist.tracks.length,
      duration: Math.round(totalDuration),
      public: playlist.isPublic,
      owner: playlist.user.username,
      created: playlist.createdAt.toISOString(),
      changed: playlist.createdAt.toISOString(),
      entry: playlist.tracks.map((pt) =>
        formatPlaylistSong(pt.track as unknown as Parameters<typeof formatPlaylistSong>[0]),
      ),
    },
  });
}

router.get('/getPlaylist', handleGetPlaylist);
router.post('/getPlaylist', handleGetPlaylist);

// ─── createPlaylist ─────────────────────────────────────────────────────────

async function handleCreatePlaylist(req: import('express').Request, res: import('express').Response) {
  const userId = req.subsonicUser?.id;
  if (!userId) {
    sendError(req, res, SubsonicError.NOT_AUTHORIZED, 'Authentication required');
    return;
  }

  const playlistId = req.query.playlistId as string;
  const name = req.query.name as string;
  const songIds = asArray(req.query.songId);

  if (playlistId) {
    // Update existing playlist
    const existing = await prisma.playlist.findUnique({ where: { id: playlistId } });
    if (!existing || existing.userId !== userId) {
      sendError(req, res, SubsonicError.NOT_AUTHORIZED, 'Not authorized to modify this playlist');
      return;
    }

    // If name is provided, update it
    if (name) {
      await prisma.playlist.update({
        where: { id: playlistId },
        data: { name },
      });
    }

    // If songIds provided, replace all tracks
    if (songIds.length > 0) {
      await prisma.playlistTrack.deleteMany({ where: { playlistId } });
      await prisma.playlistTrack.createMany({
        data: songIds.map((trackId, index) => ({
          playlistId,
          trackId,
          position: index,
        })),
      });
    }

    sendResponse(req, res);
  } else {
    // Create new playlist
    if (!name) {
      sendError(req, res, SubsonicError.MISSING_PARAMETER, 'Required parameter "name" is missing');
      return;
    }

    const playlist = await prisma.playlist.create({
      data: {
        name,
        userId,
        tracks: {
          create: songIds.map((trackId, index) => ({
            trackId,
            position: index,
          })),
        },
      },
    });

    sendResponse(req, res, {
      playlist: {
        id: playlist.id,
        name: playlist.name,
        songCount: songIds.length,
        duration: 0,
        public: false,
        owner: req.subsonicUser!.username,
        created: playlist.createdAt.toISOString(),
        changed: playlist.createdAt.toISOString(),
      },
    });
  }
}

router.get('/createPlaylist', handleCreatePlaylist);
router.post('/createPlaylist', handleCreatePlaylist);

// ─── updatePlaylist ─────────────────────────────────────────────────────────

async function handleUpdatePlaylist(req: import('express').Request, res: import('express').Response) {
  const userId = req.subsonicUser?.id;
  if (!userId) {
    sendError(req, res, SubsonicError.NOT_AUTHORIZED, 'Authentication required');
    return;
  }

  const playlistId = req.query.playlistId as string;
  if (!playlistId) {
    sendError(req, res, SubsonicError.MISSING_PARAMETER, 'Required parameter "playlistId" is missing');
    return;
  }

  const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!playlist || playlist.userId !== userId) {
    sendError(req, res, SubsonicError.NOT_AUTHORIZED, 'Not authorized to modify this playlist');
    return;
  }

  const name = req.query.name as string;
  const isPublic = req.query.public as string;
  const songIdsToAdd = asArray(req.query.songIdToAdd);
  const songIndexesToRemove = asArray(req.query.songIndexToRemove).map(Number);

  // Update name / public
  if (name || isPublic !== undefined) {
    await prisma.playlist.update({
      where: { id: playlistId },
      data: {
        ...(name ? { name } : {}),
        ...(isPublic !== undefined ? { isPublic: isPublic === 'true' } : {}),
      },
    });
  }

  // Remove songs by index (remove from highest index first to avoid shifting)
  if (songIndexesToRemove.length > 0) {
    const tracks = await prisma.playlistTrack.findMany({
      where: { playlistId },
      orderBy: { position: 'asc' },
    });

    const idsToDelete = songIndexesToRemove
      .sort((a, b) => b - a)
      .map((idx) => tracks[idx]?.id)
      .filter(Boolean) as string[];

    if (idsToDelete.length > 0) {
      await prisma.playlistTrack.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    // Re-number remaining positions
    const remaining = await prisma.playlistTrack.findMany({
      where: { playlistId },
      orderBy: { position: 'asc' },
    });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].position !== i) {
        await prisma.playlistTrack.update({
          where: { id: remaining[i].id },
          data: { position: i },
        });
      }
    }
  }

  // Add songs
  if (songIdsToAdd.length > 0) {
    const maxPos = await prisma.playlistTrack.aggregate({
      where: { playlistId },
      _max: { position: true },
    });
    const startPos = (maxPos._max.position ?? -1) + 1;

    await prisma.playlistTrack.createMany({
      data: songIdsToAdd.map((trackId, index) => ({
        playlistId,
        trackId,
        position: startPos + index,
      })),
    });
  }

  sendResponse(req, res);
}

router.get('/updatePlaylist', handleUpdatePlaylist);
router.post('/updatePlaylist', handleUpdatePlaylist);

// ─── deletePlaylist ─────────────────────────────────────────────────────────

async function handleDeletePlaylist(req: import('express').Request, res: import('express').Response) {
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

  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist) {
    sendError(req, res, SubsonicError.NOT_FOUND, 'Playlist not found');
    return;
  }

  if (playlist.userId !== userId) {
    sendError(req, res, SubsonicError.NOT_AUTHORIZED, 'Not authorized to delete this playlist');
    return;
  }

  await prisma.playlist.delete({ where: { id } });
  sendResponse(req, res);
}

router.get('/deletePlaylist', handleDeletePlaylist);
router.post('/deletePlaylist', handleDeletePlaylist);

// ─── Helper ─────────────────────────────────────────────────────────────────

function asArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  return [String(val)];
}

export default router;
