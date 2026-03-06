import { Router } from 'express';
import { prisma } from '../config/database.js';
import { findMusicVideo } from '../services/musicvideo/musicvideo.service.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router: Router = Router();

/**
 * GET /api/tracks/:id/musicvideo
 * Get music video for a track (searches if not cached)
 */
router.get('/:id/musicvideo', async (req, res, next) => {
  try {
    const trackId = String(req.params.id);
    const forceRefresh = req.query.refresh === 'true';

    // Get track info
    const track = await prisma.track.findUnique({
      where: { id: trackId },
      include: { artist: { select: { name: true } } },
    });

    if (!track) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    // Search for music video
    const result = await findMusicVideo(
      trackId,
      track.title,
      track.artist.name,
      {
        lastFmApiKey: process.env.LASTFM_API_KEY,
        youtubeApiKey: process.env.YOUTUBE_API_KEY,
        forceRefresh,
      }
    );

    if (result) {
      res.json({
        data: {
          url: result.url,
          source: result.source,
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

    const track = await prisma.track.update({
      where: { id: trackId },
      data: {
        musicVideoUrl: url,
        musicVideoSource: source,
        musicVideoCheckedAt: new Date(),
      },
    });

    res.json({
      data: {
        url: track.musicVideoUrl,
        source: track.musicVideoSource,
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

    await prisma.track.update({
      where: { id: trackId },
      data: {
        musicVideoUrl: null,
        musicVideoSource: null,
        musicVideoCheckedAt: null,
      },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
