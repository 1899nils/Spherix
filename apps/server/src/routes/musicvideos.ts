import { Router } from 'express';
import { prisma } from '../config/database.js';
import { youtube } from '../services/metadata/index.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const router: Router = Router();

/** Derive local video file path from track audio file path (swap extension → .mp4) */
function localVideoPath(audioFilePath: string): string {
  const ext = path.extname(audioFilePath);
  return audioFilePath.slice(0, -ext.length) + '.mp4';
}

/**
 * POST /api/tracks/:id/musicvideo/download
 * Download music video via yt-dlp and store next to the audio file.
 * Requires admin. Returns 202 immediately; download runs in background.
 */
router.post('/:id/musicvideo/download', async (req, res, next) => {
  try {
    const trackId = String(req.params.id);

    const track = await prisma.track.findUnique({
      where: { id: trackId },
      select: { filePath: true, musicVideoUrl: true, musicVideoSource: true },
    });

    if (!track) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    if (!track.musicVideoUrl) {
      res.status(422).json({ error: 'No music video URL set for this track' });
      return;
    }

    if (track.musicVideoSource === 'downloading') {
      res.status(409).json({ error: 'Download already in progress' });
      return;
    }

    const outputPath = localVideoPath(track.filePath);

    // Mark as downloading
    await prisma.track.update({
      where: { id: trackId },
      data: { musicVideoSource: 'downloading', musicVideoCheckedAt: new Date() },
    });

    res.status(202).json({ message: 'Download gestartet', outputPath });

    // Run yt-dlp in background
    // Format: prefer best mp4+m4a (needs ffmpeg for merge), fallback to best single-file mp4
    const ytdlp = spawn('yt-dlp', [
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--no-warnings',
      '-o', outputPath,
      track.musicVideoUrl,
    ]);

    let stderr = '';
    ytdlp.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    ytdlp.on('close', async (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        await prisma.track.update({
          where: { id: trackId },
          data: { musicVideoSource: 'local', musicVideoCheckedAt: new Date() },
        });
      } else {
        // Revert to youtube on failure
        console.error(`[yt-dlp] failed for track ${trackId}:`, stderr);
        await prisma.track.update({
          where: { id: trackId },
          data: { musicVideoSource: 'youtube', musicVideoCheckedAt: new Date() },
        });
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tracks/:id/musicvideo/status
 * Check whether a local video file exists and current download state.
 */
router.get('/:id/musicvideo/status', async (req, res, next) => {
  try {
    const trackId = String(req.params.id);
    const track = await prisma.track.findUnique({
      where: { id: trackId },
      select: { filePath: true, musicVideoUrl: true, musicVideoSource: true },
    });

    if (!track) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    const videoPath = localVideoPath(track.filePath);
    const fileExists = fs.existsSync(videoPath);

    res.json({
      data: {
        source: track.musicVideoSource,
        hasLocalFile: fileExists,
        hasYouTubeUrl: !!track.musicVideoUrl,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tracks/:id/musicvideo/stream
 * Stream the locally downloaded music video file with range-request support.
 */
router.get('/:id/musicvideo/stream', async (req, res, next) => {
  try {
    const trackId = String(req.params.id);
    const track = await prisma.track.findUnique({
      where: { id: trackId },
      select: { filePath: true },
    });

    if (!track) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    const videoPath = localVideoPath(track.filePath);

    if (!fs.existsSync(videoPath)) {
      res.status(404).json({ error: 'Local video file not found' });
      return;
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const contentType = 'video/mp4';

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });
      fs.createReadStream(videoPath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (error) {
    next(error);
  }
});

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
