import { Router } from 'express';
import { prisma } from '../../config/database.js';
import {
  probeMedia,
  parseClientCapabilities,
  canDirectPlay,
  resolveAudioTrack,
} from '../../services/streaming/mediaInfo.service.js';
import {
  checkTranscodeNeeded,
  getTranscodeJob,
  getHlsPlaylistPath,
  findJobForMedia,
  noteSegmentRequested,
  stopTranscodeForMedia,
} from '../../services/streaming/transcode.service.js';
import { join } from 'node:path';
import { createReadStream, existsSync, readFileSync } from 'node:fs';

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

    // Check direct play compatibility. `forceTranscode=1` lets the player
    // request the transcode path explicitly — used when a browser claimed
    // (via canPlayType()) that it could decode something, direct play was
    // attempted, and the video element then reported a real decode error.
    // canPlayType() is only ever a heuristic, not a guarantee (Firefox in
    // particular reports "maybe" for HEVC without reliably being able to
    // decode it), so this reactive fallback is the actual safety net, not
    // the upfront capability check.
    const forceTranscode = req.query.forceTranscode === '1';

    // Which audio track the viewer wants. Absent on the first load (the
    // file's default is used); set when they pick another one from the
    // player's track menu, which reloads the stream through here.
    const requestedAudio =
      typeof req.query.audioTrack === 'string' ? parseInt(req.query.audioTrack, 10) : NaN;
    const audioTrack = Number.isInteger(requestedAudio) ? requestedAudio : undefined;
    const resolvedAudioTrack = resolveAudioTrack(probeResult, audioTrack);

    const directPlayCheck = forceTranscode
      ? { playable: false, reason: 'Forced transcode after a direct-play decode failure' }
      : canDirectPlay(probeResult, clientCaps, audioTrack);

    // Determine optimal stream URL
    let streamUrl: string;

    if (directPlayCheck.playable) {
      // Direct play URL
      streamUrl =
        type === 'movie' ? `/api/video/movies/${id}/stream` : `/api/video/episodes/${id}/stream`;
    } else {
      // Not directly playable — HLS transcode needed, whether it's just the
      // audio codec or the video/container that's incompatible.
      //
      // This used to special-case "only audio is incompatible" into a
      // separate /stream/audio/... endpoint that piped raw ffmpeg fMP4
      // output straight into `video.src` (no manifest, faster start). In
      // practice that's an unreliable way to get video into a browser:
      // Firefox in particular would report loadedmetadata (duration/
      // dimensions known) and then just render a frozen black frame,
      // because a fragmented-MP4-via-progressive-download stream without
      // a proper moov box is a much less battle-tested path than HLS.
      //
      // startHlsTranscode() already copies the video stream untouched
      // when the client-reported video codec is compatible (see
      // `copyVideo` there) and only transcodes audio in that case — so
      // routing this through HLS instead reuses that same fast path
      // without the fragile direct-pipe machinery.
      //
      // hls.js will request this playlist URL itself and doesn't forward
      // the X-Client-Capabilities header, so the same detected
      // capabilities are embedded as a query param — see
      // parseClientCapabilities() for why.
      //
      // The audio track goes in the *path*, not the query string: hls.js
      // resolves the segment names listed in the playlist relative to the
      // playlist's own URL, so anything in the path is inherited by every
      // segment request automatically, while a query param would be dropped
      // and the segment route would have no idea which job to serve from.
      const capsParam = encodeURIComponent(JSON.stringify(clientCaps));
      streamUrl = `/api/video/stream/hls/${type}/${id}/a${resolvedAudioTrack}/playlist.m3u8?caps=${capsParam}`;
    }

    res.json({
      data: {
        id,
        type,
        streamUrl,
        directPlay: directPlayCheck.playable,
        directPlayReason: directPlayCheck.reason,
        // Which audio track this stream actually carries, so the player can
        // show the right entry as selected rather than guessing.
        audioTrack: resolvedAudioTrack,
        mediaInfo: {
          container: probeResult.container,
          duration: probeResult.duration,
          video: probeResult.video,
          audio: probeResult.audio.map((a) => ({
            index: a.index,
            codec: a.codec,
            language: a.language,
            channels: a.channels,
            default: a.default,
          })),
          subtitles: probeResult.subtitles.map((s) => ({
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
 * Parse the `aN` audio-track path segment used by the HLS routes.
 * Returns undefined for anything malformed, which falls back to the file's
 * default track rather than failing the request.
 */
function parseAudioTrackParam(value: string): number | undefined {
  const match = /^a(\d+)$/.exec(value);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * GET /api/video/stream/hls/:type/:id/:track/playlist.m3u8
 * Get HLS playlist for transcoded stream. `:track` is `a<index>`, naming the
 * audio track the stream carries — see the /info route for why it lives in
 * the path.
 */
router.get('/hls/:type/:id/:track/playlist.m3u8', async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const audioTrack = parseAudioTrackParam(req.params.track);
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
      clientCaps,
      audioTrack,
    );

    if (transcodeCheck.directPlay) {
      // Return redirect to direct stream
      const directUrl =
        type === 'movie' ? `/api/video/movies/${id}/stream` : `/api/video/episodes/${id}/stream`;

      res.redirect(directUrl);
      return;
    }

    const job = transcodeCheck.transcodeJob;
    if (!job) {
      res.status(500).json({ error: 'Failed to start transcode' });
      return;
    }

    // Wait for enough of a head start before handing the playlist over.
    //
    // Responding as soon as the file merely *exists* means handing the
    // player a playlist with a single segment in it, and since ffmpeg is
    // still writing, playback immediately runs up against the end of what
    // has been produced — one of the causes of the reported stutter.
    // Waiting for a few segments gives the player something to buffer.
    const MIN_SEGMENTS = 4;
    if (job.status === 'pending' || job.status === 'processing') {
      const maxWait = 30000; // 30 seconds max
      const checkInterval = 300;
      let waited = 0;

      while (waited < maxWait && (job.status === 'pending' || job.status === 'processing')) {
        const playlistPath = getHlsPlaylistPath(job.id);
        if (playlistPath && existsSync(playlistPath)) {
          // Count the segments actually listed in the playlist so far.
          const segmentCount = (readFileSync(playlistPath, 'utf8').match(/#EXTINF:/g) ?? []).length;
          if (segmentCount >= MIN_SEGMENTS) break;
        }
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
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
 * GET /api/video/stream/hls/:type/:id/:track/:file
 * Serve HLS media files: MPEG-TS segments, fMP4 segments, and the fMP4
 * init segment. (HEVC has to be delivered as fMP4, so a single route
 * covering all three is simpler than one per container.)
 */
const HLS_FILE_RE = /^(?:init\.mp4|segment_\d+\.(?:ts|m4s))$/;

router.get('/hls/:type/:id/:track/:file', async (req, res, next) => {
  try {
    const { id, file } = req.params;
    const audioTrack = parseAudioTrackParam(req.params.track);

    // Strict allowlist — `file` lands in a filesystem path below, so it must
    // never be able to escape the job's output directory.
    if (!HLS_FILE_RE.test(file)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    // Look the job up directly instead of re-scanning the whole transcode
    // directory with readdir() on every single segment request (this used
    // to happen once per segment for the entire playback session).
    // Matching on the audio track matters as soon as the viewer switches
    // one: two jobs then exist for the same media, and serving segments
    // from the wrong one would deliver the wrong soundtrack.
    const job = findJobForMedia(id, audioTrack);

    if (!job) {
      res.status(404).json({ error: 'Transcode job not found' });
      return;
    }

    // Let the throttler know how far playback has actually got, so ffmpeg
    // can be paused/resumed instead of racing to convert the whole file.
    const segMatch = /^segment_(\d+)\./.exec(file);
    if (segMatch) {
      noteSegmentRequested(id, parseInt(segMatch[1], 10), audioTrack);
    }

    const segmentFile = join(job.outputDir, file);

    if (!existsSync(segmentFile)) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }

    res.setHeader('Content-Type', file.endsWith('.ts') ? 'video/mp2t' : 'video/mp4');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache segments forever
    createReadStream(segmentFile).pipe(res);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/video/stream/stop/:type/:id
 * Tell the server the viewer stopped watching, so any transcode running for
 * this media can be shut down immediately instead of continuing to encode a
 * film nobody is watching. (The idle reaper catches clients that vanish
 * without sending this; it just takes a couple of minutes longer.)
 */
router.post('/stop/:type/:id', async (req, res, next) => {
  try {
    const stopped = stopTranscodeForMedia(req.params.id);
    res.json({ data: { stopped } });
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
 * GET /api/video/stream/subtitle/:type/:id/:streamIndex
 * Extract a subtitle track from the media file and serve it as WebVTT.
 * :streamIndex is the absolute ffprobe stream index.
 */
router.get('/subtitle/:type/:id/:streamIndex', async (req, res, next) => {
  try {
    const { type, id, streamIndex } = req.params;
    const idx = parseInt(streamIndex, 10);
    if (isNaN(idx) || idx < 0) {
      res.status(400).json({ error: 'Invalid stream index' });
      return;
    }

    let filePath: string | null = null;
    if (type === 'movie') {
      const movie = await prisma.movie.findUnique({ where: { id }, select: { filePath: true } });
      filePath = movie?.filePath ?? null;
    } else if (type === 'episode') {
      const episode = await prisma.episode.findUnique({
        where: { id },
        select: { filePath: true },
      });
      filePath = episode?.filePath ?? null;
    } else {
      res.status(400).json({ error: 'Invalid type' });
      return;
    }

    if (!filePath || !existsSync(filePath)) {
      res.status(404).json({ error: 'Media file not found' });
      return;
    }

    const { spawn } = await import('node:child_process');
    const ffmpeg = spawn('ffmpeg', [
      '-i',
      filePath,
      '-map',
      `0:${idx}`,
      '-c:s',
      'webvtt',
      '-f',
      'webvtt',
      'pipe:1',
    ]);

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');

    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on('data', () => {});
    ffmpeg.on('error', (err) => {
      if (!res.headersSent) next(err);
    });
    res.on('close', () => ffmpeg.kill());
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/video/stream/audio-only/:type/:id
 * Stream a single audio track transcoded to AAC with NO video channel.
 * Used by the web player's separate <audio> element when the primary video
 * file has an incompatible audio codec (AC3/DTS/TrueHD).
 *
 * Query params:
 *   track  – 0-based index into the audio stream list (default: 0)
 *   start  – start offset in seconds (default: 0)
 */
router.get('/audio-only/:type/:id', async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const audioTrack = Math.max(0, parseInt((req.query.track as string) || '0', 10));
    const startSec = Math.max(0, parseFloat((req.query.start as string) || '0'));

    let filePath: string | null = null;
    if (type === 'movie') {
      const movie = await prisma.movie.findUnique({ where: { id }, select: { filePath: true } });
      filePath = movie?.filePath ?? null;
    } else if (type === 'episode') {
      const episode = await prisma.episode.findUnique({
        where: { id },
        select: { filePath: true },
      });
      filePath = episode?.filePath ?? null;
    } else {
      res.status(400).json({ error: 'Invalid type' });
      return;
    }

    if (!filePath || !existsSync(filePath)) {
      res.status(404).json({ error: 'Media file not found' });
      return;
    }

    const { spawn } = await import('node:child_process');
    const args = [
      ...(startSec > 0 ? ['-ss', String(startSec)] : []),
      '-i',
      filePath,
      '-vn', // no video
      '-map',
      `0:a:${audioTrack}`,
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      '-f',
      'mp4',
      'pipe:1',
    ];

    const ffmpeg = spawn('ffmpeg', args);
    let headersSentByUs = false;

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      if (!headersSentByUs) {
        res.setHeader('Content-Type', 'audio/mp4');
        res.setHeader('Cache-Control', 'no-cache');
        headersSentByUs = true;
      }
      res.write(chunk);
    });

    ffmpeg.stdout.on('end', () => {
      if (!headersSentByUs) {
        // ffmpeg produced no output — send a proper error
        res.status(500).json({ error: 'ffmpeg produced no audio output' });
        return;
      }
      res.end();
    });

    ffmpeg.stderr.on('data', () => {});

    ffmpeg.on('error', (err) => {
      if (!headersSentByUs) {
        next(err);
      } else {
        res.end();
      }
    });

    res.on('close', () => ffmpeg.kill());
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/video/stream/audio/:type/:id
 * Re-mux the media file with a specific audio track via ffmpeg and stream
 * the result as fragmented MP4. Used for browsers without native audioTracks API.
 *
 * Query params:
 *   track  – 0-based index into the audio stream list (default: 0)
 *   start  – start offset in seconds (default: 0)
 */
router.get('/audio/:type/:id', async (req, res, next) => {
  try {
    const { type, id } = req.params;
    const audioTrack = Math.max(0, parseInt((req.query.track as string) || '0', 10));
    const startSec = Math.max(0, parseFloat((req.query.start as string) || '0'));

    let filePath: string | null = null;
    if (type === 'movie') {
      const movie = await prisma.movie.findUnique({ where: { id }, select: { filePath: true } });
      filePath = movie?.filePath ?? null;
    } else if (type === 'episode') {
      const episode = await prisma.episode.findUnique({
        where: { id },
        select: { filePath: true },
      });
      filePath = episode?.filePath ?? null;
    } else {
      res.status(400).json({ error: 'Invalid type' });
      return;
    }

    if (!filePath || !existsSync(filePath)) {
      res.status(404).json({ error: 'Media file not found' });
      return;
    }

    const { spawn } = await import('node:child_process');
    const args = [
      // Input seek: fast keyframe seek when a start offset is requested.
      // -avoid_negative_ts make_zero normalises all output timestamps so the
      // first packet is always at t=0 — required for the browser to accept
      // the fragmented MP4 stream.
      ...(startSec > 0 ? ['-ss', String(startSec), '-avoid_negative_ts', 'make_zero'] : []),
      '-i',
      filePath,
      '-map',
      '0:v:0',
      '-map',
      `0:a:${audioTrack}`,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      '-f',
      'mp4',
      'pipe:1',
    ];

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Cache-Control', 'no-cache');

    const ffmpeg = spawn('ffmpeg', args);
    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on('data', () => {});
    ffmpeg.on('error', (err) => {
      if (!res.headersSent) next(err);
    });
    res.on('close', () => ffmpeg.kill());
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
