import { Router } from 'express';
import { prisma } from '../config/database.js';
import { findMusicVideo, getCachedMusicVideo } from '../services/musicvideo/musicvideo.service.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logger } from '../config/logger.js';

const router: Router = Router();

/**
 * POST /api/albums/:id/musicvideo-search
 * Search for music videos for all tracks in an album
 */
router.post('/:id/musicvideo-search', async (req, res, next) => {
  try {
    const albumId = String(req.params.id);
    const forceRefresh = req.body.force === true;
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

    // Search for music videos for each track
    const results: Array<{
      trackId: string;
      trackTitle: string;
      found: boolean;
      url?: string;
      source?: string;
    }> = [];

    for (const track of album.tracks) {
      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = await getCachedMusicVideo(track.id);
        if (cached) {
          results.push({
            trackId: track.id,
            trackTitle: track.title,
            found: true,
            url: cached.url,
            source: cached.source,
          });
          continue;
        }
      }

      // Search for video
      try {
        const result = await findMusicVideo(
          track.id,
          track.title,
          track.artist.name,
          { userId, forceRefresh }
        );

        results.push({
          trackId: track.id,
          trackTitle: track.title,
          found: !!result,
          url: result?.url,
          source: result?.source,
        });
      } catch (error) {
        logger.warn('Music video search failed for track', { 
          trackId: track.id, 
          error: String(error) 
        });
        results.push({
          trackId: track.id,
          trackTitle: track.title,
          found: false,
        });
      }
    }

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

    // Search for music video
    const result = await findMusicVideo(
      trackId,
      track.title,
      track.artist.name,
      {
        userId,
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
