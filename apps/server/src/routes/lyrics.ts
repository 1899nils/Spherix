import { Router } from 'express';
import { prisma } from '../config/database.js';
import { lrclib } from '../services/metadata/index.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router: Router = Router();

/**
 * GET /api/tracks/:id/lyrics
 * Get lyrics for a track (searches if not cached)
 */
router.get('/:id/lyrics', async (req, res, next) => {
  try {
    const trackId = String(req.params.id);

    // Get track with relations
    const track = await prisma.track.findUnique({
      where: { id: trackId },
      include: { artist: true, album: true },
    });

    if (!track) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    // Return cached lyrics if available
    if (track.lyrics) {
      res.json({
        data: {
          lyrics: track.lyrics,
          source: 'database',
          synced: false, // We don't store synced lyrics separately yet
        },
      });
      return;
    }

    // Try to fetch from LRCLIB
    let lyricsResult = null;

    // Try by MusicBrainz ID first
    if (track.musicbrainzId) {
      lyricsResult = await lrclib.getLyricsByRecordingId(track.musicbrainzId);
    }

    // Fall back to search
    if (!lyricsResult) {
      lyricsResult = await lrclib.searchLyrics(
        track.title,
        track.artist.name,
        track.album?.title,
        track.duration
      );
    }

    if (lyricsResult?.plainLyrics) {
      const formattedLyrics = lrclib.formatLyricsForStorage(lyricsResult);
      
      // Save to database
      await prisma.track.update({
        where: { id: trackId },
        data: { lyrics: formattedLyrics },
      });

      res.json({
        data: {
          lyrics: formattedLyrics,
          source: 'lrclib',
          synced: !!lyricsResult.syncedLyrics,
        },
      });
    } else {
      res.status(404).json({ error: 'No lyrics found' });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/albums/:id/lyrics-search
 * Search for lyrics for all tracks in an album
 */
router.post('/albums/:id/lyrics-search', async (req, res, next) => {
  try {
    const albumId = String(req.params.id);

    const album = await prisma.album.findUnique({
      where: { id: albumId },
      include: {
        tracks: {
          include: { artist: true },
          orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }],
        },
      },
    });

    if (!album) {
      res.status(404).json({ error: 'Album not found' });
      return;
    }

    const results: Array<{
      trackId: string;
      trackTitle: string;
      found: boolean;
    }> = [];

    for (const track of album.tracks) {
      // Skip if already has lyrics
      if (track.lyrics) {
        results.push({
          trackId: track.id,
          trackTitle: track.title,
          found: true,
        });
        continue;
      }

      // Try to fetch lyrics
      let lyricsResult = null;

      if (track.musicbrainzId) {
        lyricsResult = await lrclib.getLyricsByRecordingId(track.musicbrainzId);
      }

      if (!lyricsResult) {
        lyricsResult = await lrclib.searchLyrics(
          track.title,
          track.artist.name,
          album.title,
          track.duration
        );
      }

      if (lyricsResult?.plainLyrics) {
        await prisma.track.update({
          where: { id: track.id },
          data: { lyrics: lrclib.formatLyricsForStorage(lyricsResult) },
        });
        results.push({
          trackId: track.id,
          trackTitle: track.title,
          found: true,
        });
      } else {
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
 * PUT /api/tracks/:id/lyrics (Admin only)
 * Manually set lyrics
 */
router.put('/:id/lyrics', requireAdmin, async (req, res, next) => {
  try {
    const trackId = String(req.params.id);
    const { lyrics } = req.body;

    await prisma.track.update({
      where: { id: trackId },
      data: { lyrics: lyrics || null },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
