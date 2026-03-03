import { Router } from 'express';
import { prisma } from '../config/database.js';
import { radioPoller, type ParsedTrack } from '../services/radio/radio-metadata.service.js';

const router: Router = Router();

async function getUserId(req: any): Promise<string | null> {
  if (req.session?.userId) return req.session.userId as string;
  const user = await prisma.user.findFirst({ select: { id: true } });
  return user?.id ?? null;
}

/** Start ICY metadata polling for the current user's radio station */
router.post('/start', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { stationUrl, stationName } = req.body as {
      stationUrl?: string;
      stationName?: string;
    };

    if (!stationUrl) {
      res.status(400).json({ error: 'stationUrl is required' });
      return;
    }

    await radioPoller.start(userId, stationUrl, stationName ?? 'Radio');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** Get the currently playing radio track metadata for the current user */
router.get('/current-track', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const track = radioPoller.getCurrentTrack(userId);
    res.json({ track }); // { track: { artist, title } | null }
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * SSE endpoint — pushes track changes to the client in real-time.
 * The client connects once; whenever the server detects a new song it
 * immediately sends `data: { track }` without the client having to poll.
 */
router.get('/events', async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) {
    res.status(401).end();
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // Send the current track immediately so the client doesn't have to wait
  const current = radioPoller.getCurrentTrack(userId);
  res.write(`data: ${JSON.stringify({ track: current })}\n\n`);

  const send = (track: ParsedTrack | null) => {
    res.write(`data: ${JSON.stringify({ track })}\n\n`);
  };

  radioPoller.subscribe(userId, send);

  req.on('close', () => {
    radioPoller.unsubscribe(userId, send);
  });
});

/** Stop ICY metadata polling for the current user */
router.post('/stop', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    radioPoller.stop(userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;
