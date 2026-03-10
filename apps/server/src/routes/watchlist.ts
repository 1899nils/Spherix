import { Router } from 'express';
import { prisma } from '../config/database.js';
import { searchRecording } from '../services/musicbrainz/musicbrainz.service.js';

const router: Router = Router();

async function getUserId(req: any): Promise<string | null> {
  if (req.session?.userId) return req.session.userId as string;
  const user = await prisma.user.findFirst({ select: { id: true } });
  return user?.id ?? null;
}

/** Try to enrich a watchlist item with MusicBrainz metadata (cover, album, duration) */
async function enrichWithMusicBrainz(artist: string, title: string) {
  try {
    const safeTitle = title.replace(/"/g, '');
    const safeArtist = artist.replace(/"/g, '');
    const result = await searchRecording(`recording:"${safeTitle}" AND artist:"${safeArtist}"`, 3);
    const recording = result.recordings?.find((r: any) => (r.score ?? 0) >= 70);
    if (!recording) return {};

    const release = recording.releases?.[0];
    return {
      albumTitle: release?.title ?? null,
      mbRecordingId: recording.id ?? null,
      duration: recording.length != null ? Math.round(recording.length / 1000) : null,
    };
  } catch {
    return {};
  }
}

// GET /api/watchlist — list all items for current user
router.get('/', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const items = await prisma.watchlistItem.findMany({
      where: { userId },
      orderBy: { addedAt: 'desc' },
      include: {
        track: {
          include: {
            artist: { select: { id: true, name: true } },
            album: { select: { id: true, title: true, coverUrl: true, year: true } },
          },
        },
      },
    });

    res.json({ data: items });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/watchlist — add an item
router.post('/', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { title, artist, source = 'radio', coverUrl, albumTitle, duration, mbRecordingId } =
      req.body as {
        title: string;
        artist: string;
        source?: string;
        coverUrl?: string;
        albumTitle?: string;
        duration?: number;
        mbRecordingId?: string;
      };

    if (!title || !artist) {
      res.status(400).json({ error: 'title and artist are required' });
      return;
    }

    // Check if already in watchlist
    const existing = await prisma.watchlistItem.findUnique({
      where: { userId_title_artist: { userId, title, artist } },
    });
    if (existing) {
      res.status(409).json({ error: 'Already in watchlist', data: existing });
      return;
    }

    // Create immediately with provided data
    const item = await prisma.watchlistItem.create({
      data: { userId, title, artist, source, coverUrl, albumTitle, duration, mbRecordingId },
    });

    // Enrich asynchronously (don't block the response)
    void enrichWithMusicBrainz(artist, title).then(async (enriched) => {
      if (Object.keys(enriched).length === 0) return;
      await prisma.watchlistItem.update({
        where: { id: item.id },
        data: enriched,
      }).catch(() => {});
    });

    res.status(201).json({ data: item });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/watchlist/:id — remove an item
router.delete('/:id', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { id } = req.params;
    const item = await prisma.watchlistItem.findFirst({ where: { id, userId } });
    if (!item) { res.status(404).json({ error: 'Not found' }); return; }

    await prisma.watchlistItem.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
