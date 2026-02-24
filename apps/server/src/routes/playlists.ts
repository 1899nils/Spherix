import { Router } from 'express';
import { prisma } from '../config/database.js';
import type { Playlist, PlaylistWithTracks } from '@musicserver/shared';

const router: Router = Router();

/** Helper to get current user ID (or a fallback for dev) */
async function getUserId(req: any) {
  if (req.session?.userId) return req.session.userId;
  // Fallback to first user in DB if no session
  const user = await prisma.user.findFirst({ select: { id: true } });
  return user?.id || null;
}

/** List all playlists for current user, sorted by pinned then lastPlayedAt */
router.get('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      res.json({ data: [] });
      return;
    }

    const playlists = await prisma.playlist.findMany({
      where: { userId },
      orderBy: [
        { isPinned: 'desc' },
        { lastPlayedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        _count: { select: { tracks: true } },
      },
    });

    const data: Playlist[] = playlists.map((p) => ({
      id: p.id,
      name: p.name,
      coverUrl: p.coverUrl,
      userId: p.userId,
      isPublic: p.isPublic,
      isPinned: p.isPinned,
      lastPlayedAt: p.lastPlayedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      trackCount: p._count.tracks,
    })) as any;

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

/** Create a new playlist */
router.post('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const { name, coverUrl, trackIds } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Playlist name is required' });
      return;
    }

    const playlist = await prisma.playlist.create({
      data: {
        name,
        coverUrl: coverUrl || null,
        userId,
        tracks: {
          create: (trackIds || []).map((trackId: string, index: number) => ({
            trackId,
            position: index,
          })),
        },
      },
    });

    res.json({ data: playlist });
  } catch (error) {
    next(error);
  }
});

/** Toggle pin status of a playlist */
router.patch('/:id/pin', async (req, res, next) => {
  try {
    const { id } = req.params;
    const playlist = await prisma.playlist.findUnique({ where: { id } });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    const updated = await prisma.playlist.update({
      where: { id },
      data: { isPinned: !playlist.isPinned },
    });

    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
});

/** Get playlist details with tracks */
router.get('/:id', async (req, res, next) => {
  try {
    const playlist = await prisma.playlist.findUnique({
      where: { id: String(req.params.id) },
      include: {
        tracks: {
          include: {
            track: {
              include: {
                artist: { select: { id: true, name: true } },
                album: { select: { id: true, title: true, coverUrl: true, year: true, label: true } },
              },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }

    const data: PlaylistWithTracks = {
      id: playlist.id,
      name: playlist.name,
      coverUrl: playlist.coverUrl,
      userId: playlist.userId,
      isPublic: playlist.isPublic,
      isPinned: playlist.isPinned,
      lastPlayedAt: playlist.lastPlayedAt?.toISOString() ?? null,
      createdAt: playlist.createdAt.toISOString(),
      trackCount: playlist.tracks.length,
      tracks: playlist.tracks.map((pt) => ({
        ...pt.track,
        fileSize: pt.track.fileSize.toString(),
        createdAt: pt.track.createdAt.toISOString(),
      })) as any,
    };

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

/** Update last played timestamp */
router.post('/:id/played', async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.playlist.update({
      where: { id },
      data: { lastPlayedAt: new Date() },
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
