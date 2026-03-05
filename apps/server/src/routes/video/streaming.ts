import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { probeMedia, parseClientCapabilities, canDirectPlay } from '../../services/streaming/mediaInfo.service.js';
import { checkTranscodeNeeded, getTranscodeJob, getHlsPlaylistPath, getTranscodeDirectory } from '../../services/streaming/transcode.service.js';
import { join } from 'node:path';
import { createReadStream, existsSync } from 'node:fs';

const router: Router = Router();

/**
 * GET /api/video/stream/info/:type/:id
 * Get streaming info for a media item (movie or episode)
 * Returns: codec info, available streams, direct play eligibility
 */
router.get('/info/:type/:id', async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const clientCaps = parseClientCapabilities(req);

    let filePath: string | null = null;

    if (type === 'movie') {
      const movie = await prisma.movie.findUnique({
        where: { id },
        select: { filePath: true, title: true },
      });
      if (!movie) {
        res.status(404).json({ error: 'Movie not found' });
        return;
      }
      filePath = movie.filePath;
    } else if (type === 'episode') {
      const episode = await prisma.episode.findUnique({
        where: { id },
        select: { filePath: true, title: true },
      });
      if (!episode) {
        res.status(404).json({ error: 'Episode not found' });
        return;
      }
      filePath = episode.filePath;
    } else {
      res.status(400).json({ error: 'Invalid type. Use "movie" or "episode"' });
      return;
    }

    if (!filePath || !existsSync(filePath)) {
      res.status(404).json({ error: 'Media file not found on disk' });
      return;
    }

    // Probe media file
    const probeResult = await probeMedia(filePath);
    if (!probeResult) {
      res.status(500).json({ error: 'Failed to probe media file' });
      return;
    }

    // Check direct play compatibility
    const directPlayCheck = canDirectPlay(probeResult, clientCaps);

    // Determine optimal stream URL
    let streamUrl: string;

    if (directPlayCheck.playable) {
      // Direct play URL
      streamUrl = type === 'movie' 
        ? `/api/video/movies/${id}/stream`
        : `/api/video/episodes/${id}/stream`;
    } else {
      // Will need transcoding - return HLS endpoint
      streamUrl = `/api/video/stream/hls/${type}/${id}/playlist.m3u8`;
    }

    res.json({
      data: {
        id,
        type,
        streamUrl,
        directPlay: directPlayCheck.playable,
        directPlayReason: directPlayCheck.reason,
        mediaInfo: {
          container: probeResult.container,
          duration: probeResult.duration,
          video: probeResult.video,
          audio: probeResult.audio.map(a => ({
            index: a.index,
            codec: a.codec,
            language: a.language,
            channels: a.channels,
            default: a.default,
          })),
          subtitles: probeResult.subtitles.map(s => ({
            index: s.index,
            codec: s.codec,
            language: s.language,
            default: s.default,
            forced: s.forced,
          })),
        },
        clientCapabilities: clientCaps,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/video/stream/hls/:type/:id/playlist.m3u8
 * Get HLS playlist for transcoded stream
 */
router.get('/hls/:type/:id/playlist.m3u8', async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const clientCaps = parseClientCapabilities(req);

    let filePath: string | null = null;

    if (type === 'movie') {
      const movie = await prisma.movie.findUnique({
        where: { id },
        select: { filePath: true },
      });
      filePath = movie?.filePath || null;
    } else if (type === 'episode') {
      const episode = await prisma.episode.findUnique({
        where: { id },
        select: { filePath: true },
      });
      filePath = episode?.filePath || null;
    }

    if (!filePath || !existsSync(filePath)) {
      res.status(404).json({ error: 'Media file not found' });
      return;
    }

    // Check if transcoding is needed
    const transcodeCheck = await checkTranscodeNeeded(
      id,
      type as 'movie' | 'episode',
      filePath,
      clientCaps
    );

    if (transcodeCheck.directPlay) {
      // Return redirect to direct stream
      const directUrl = type === 'movie'
        ? `/api/video/movies/${id}/stream`
        : `/api/video/episodes/${id}/stream`;
      
      res.redirect(directUrl);
      return;
    }

    const job = transcodeCheck.transcodeJob;
    if (!job) {
      res.status(500).json({ error: 'Failed to start transcode' });
      return;
    }

    // Wait a bit for initial segments to be generated
    if (job.status === 'pending' || job.status === 'processing') {
      // Check if playlist exists
      const maxWait = 30000; // 30 seconds max
      const checkInterval = 500; // 500ms
      let waited = 0;

      while (waited < maxWait && job.status === 'processing') {
        const playlistPath = getHlsPlaylistPath(job.id);
        if (playlistPath && existsSync(playlistPath)) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waited += checkInterval;
      }
    }

    if (job.status === 'failed') {
      res.status(500).json({ error: 'Transcoding failed', reason: job.error });
      return;
    }

    // Serve the playlist
    const playlistPath = getHlsPlaylistPath(job.id);
    if (!playlistPath || !existsSync(playlistPath)) {
      res.status(503).json({ 
        error: 'Transcoding in progress', 
        progress: job.progress,
        jobId: job.id,
      });
      return;
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache');
    createReadStream(playlistPath).pipe(res);

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/video/stream/hls/:type/:id/segment_:num.ts
 * Serve HLS segments
 */
router.get('/hls/:type/:id/segment_:num.ts', async (req, res, next) => {
  try {
    const { id, num } = req.params;
    
    // Find active transcode job for this media
    // In production, you'd want a better way to track this
    const { readdir } = await import('node:fs/promises');
    
    const transcodeDir = getTranscodeDirectory();
    const dirs = await readdir(transcodeDir);
    const jobDir = dirs.find(d => d.startsWith(`transcode_${id}_`));
    
    if (!jobDir) {
      res.status(404).json({ error: 'Transcode job not found' });
      return;
    }

    const segmentFile = join(transcodeDir, jobDir, `segment_${num}.ts`);
    
    if (!existsSync(segmentFile)) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }

    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache segments forever
    createReadStream(segmentFile).pipe(res);

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/video/stream/job/:jobId/status
 * Get transcode job status
 */
router.get('/job/:jobId/status', async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const job = getTranscodeJob(jobId);

    if (!job) {
      res.status(404).json({ error: 'Transcode job not found' });
      return;
    }

    res.json({
      data: {
        id: job.id,
        status: job.status,
        progress: job.progress,
        error: job.error,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/video/stream/job/:jobId/cancel
 * Cancel a running transcode job
 */
router.post('/job/:jobId/cancel', async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { cancelTranscodeJob } = await import('../../services/streaming/transcode.service.js');
    
    const cancelled = cancelTranscodeJob(jobId);
    
    if (!cancelled) {
      res.status(404).json({ error: 'Job not found or not running' });
      return;
    }

    res.json({ data: { success: true } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/video/stream/capabilities
 * Get detected client capabilities
 */
router.get('/capabilities', async (req, res) => {
  const clientCaps = parseClientCapabilities(req);
  res.json({ data: clientCaps });
});

export default router;
