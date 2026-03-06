import { Router } from 'express';
import { prisma } from '../config/database.js';
import { enrichAlbum, batchEnrichAlbums, quickEnrichTrack } from '../services/metadata/index.js';

const router: Router = Router();

/**
 * POST /api/albums/:id/enrich
 * Enrich an album with metadata from all sources
 */
router.post('/albums/:id/enrich', async (req, res, next) => {
  try {
    const albumId = String(req.params.id);

    // Check if album exists
    const album = await prisma.album.findUnique({
      where: { id: albumId },
      select: { id: true, title: true },
    });

    if (!album) {
      res.status(404).json({ error: 'Album not found' });
      return;
    }

    // Run enrichment
    const result = await enrichAlbum(albumId);

    res.json({
      data: {
        albumId: result.albumId,
        enriched: result.enriched,
        changes: result.changes,
        errors: result.errors,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tracks/:id/enrich
 * Quick enrich a single track
 */
router.post('/tracks/:id/enrich', async (req, res, next) => {
  try {
    const trackId = String(req.params.id);

    const result = await quickEnrichTrack(trackId);

    if (!result) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    res.json({
      data: {
        trackId: result.trackId,
        enriched: !!(result.lyrics || result.musicVideoUrl),
        lyrics: !!result.lyrics,
        musicVideo: !!result.musicVideoUrl,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/metadata/batch-enrich
 * Batch enrich multiple albums (for admin/background jobs)
 */
router.post('/batch-enrich', async (req, res, next) => {
  try {
    const { albumIds } = req.body;

    if (!Array.isArray(albumIds) || albumIds.length === 0) {
      res.status(400).json({ error: 'albumIds array required' });
      return;
    }

    // Limit batch size
    if (albumIds.length > 50) {
      res.status(400).json({ error: 'Maximum 50 albums per batch' });
      return;
    }

    const results = await batchEnrichAlbums(albumIds);

    const summary = {
      total: results.length,
      enriched: results.filter(r => r.enriched).length,
      errors: results.filter(r => r.errors.length > 0).length,
    };

    res.json({
      data: {
        summary,
        results,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/metadata/stats
 * Get metadata enrichment statistics
 */
router.get('/stats', async (_req, res, next) => {
  try {
    const [
      totalAlbums,
      albumsWithMb,
      albumsWithCover,
      totalTracks,
      tracksWithLyrics,
      tracksWithVideo,
      tracksWithMb,
    ] = await Promise.all([
      prisma.album.count(),
      prisma.album.count({ where: { musicbrainzId: { not: null } } }),
      prisma.album.count({ where: { coverUrl: { not: null } } }),
      prisma.track.count(),
      prisma.track.count({ where: { lyrics: { not: null } } }),
      prisma.track.count({ where: { musicVideoUrl: { not: null } } }),
      prisma.track.count({ where: { musicbrainzId: { not: null } } }),
    ]);

    res.json({
      data: {
        albums: {
          total: totalAlbums,
          withMusicBrainz: albumsWithMb,
          withCoverArt: albumsWithCover,
          musicBrainzPercentage: totalAlbums > 0 ? Math.round((albumsWithMb / totalAlbums) * 100) : 0,
        },
        tracks: {
          total: totalTracks,
          withLyrics: tracksWithLyrics,
          withMusicVideo: tracksWithVideo,
          withMusicBrainz: tracksWithMb,
          lyricsPercentage: totalTracks > 0 ? Math.round((tracksWithLyrics / totalTracks) * 100) : 0,
          videoPercentage: totalTracks > 0 ? Math.round((tracksWithVideo / totalTracks) * 100) : 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
