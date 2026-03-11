import { Router } from 'express';
import { prisma } from '../config/database.js';
import { youtube } from '../services/metadata/index.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router: Router = Router();

/**
 * POST /api/albums/:id/musicvideo-search
 * Search for music videos for all tracks in an album
 */
router.post('/:id/musicvideo-search', async (req, res, next) => {
  try {
    const albumId = String(req.params.id);
    const userId = req.session?.userId;

    // Get album with tracks
    const album = await prisma.album.findUnique({
      where: { id: albumId },
      include: {
        tracks: {
          include: { artist: { select: { name: true } } },
          orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
        },
      },
    });

    if (!album) {
      res.status(404).json({ error: 'Album not found' });
      return;
    }

    if (album.tracks.length === 0) {
      res.status(404).json({ error: 'Album has no tracks' });
      return;
    }

    // Check if YouTube API key is configured
    const apiKey = await youtube.getYouTubeApiKey(userId);
    if (!apiKey) {
      res.status(422).json({ error: 'Kein YouTube API-Key konfiguriert. Bitte in den Einstellungen einen YouTube Data API v3 Key hinterlegen.' });
      return;
    }

    // Use the new batch search (forceRefresh not used in batch yet)
    const trackData = album.tracks.map(t => ({
      id: t.id,
      title: t.title,
      artistName: t.artist.name,
    }));

    const batchResults = await youtube.batchFindMusicVideos(trackData, userId);

    const results = album.tracks.map(track => {
      const result = batchResults.get(track.id);
      return {
        trackId: track.id,
        trackTitle: track.title,
        found: !!result,
        url: result?.url,
        source: 'youtube',
      };
    });

    const foundCount = results.filter(r => r.found).length;

    res.json({
      data: {
        total: results.length,
        found: foundCount,
        results,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tracks/:id/musicvideo
 * Get music video for a track (searches if not cached)
 */
router.get('/:id/musicvideo', async (req, res, next) => {
  try {
    const trackId = String(req.params.id);
    const forceRefresh = req.query.refresh === 'true';
    const userId = req.session?.userId;

    // Get track info
    const track = await prisma.track.findUnique({
      where: { id: trackId },
      include: { artist: { select: { name: true } } },
    });

    if (!track) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    // Use the new youtube provider
    const result = await youtube.findMusicVideo(
      trackId,
      track.title,
      track.artist.name,
      { userId, forceRefresh }
    );

    if (result) {
      res.json({
        data: {
          url: result.url,
          source: 'youtube',
          title: result.title,
        },
      });
    } else {
      res.status(404).json({ error: 'No music video found' });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tracks/:id/musicvideo (Admin only)
 * Manually set music video URL
 */
router.post('/:id/musicvideo', requireAdmin, async (req, res, next) => {
  try {
    const trackId = String(req.params.id);
    const { url, source = 'manual' } = req.body;

    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    // Extract video ID for validation (not stored separately)

    await prisma.track.update({
      where: { id: trackId },
      data: {
        musicVideoUrl: url,
        musicVideoSource: source,
        musicVideoCheckedAt: new Date(),
      },
    });

    res.json({
      data: {
        url,
        source,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/tracks/:id/musicvideo (Admin only)
 * Remove music video from track
 */
router.delete('/:id/musicvideo', requireAdmin, async (req, res, next) => {
  try {
    const trackId = String(req.params.id);

    await youtube.removeMusicVideo(trackId);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
