import { Router } from 'express';
import { prisma } from '../config/database.js';
import { radioPoller, type ParsedTrack } from '../services/radio/radio-metadata.service.js';

const router: Router = Router();

async function getUserId(req: any): Promise<string | null> {
  if (req.session?.userId) return req.session.userId as string;
  const user = await prisma.user.findFirst({ select: { id: true } });
  return user?.id ?? null;
}

/**
 * Tries to find a logo for the given stream URL.
 * 1. Clearbit Logo API (high-quality brand logos)
 * 2. Google Favicon service as fallback
 * Returns null if the domain can't be extracted.
 */
async function resolveStationLogo(streamUrl: string): Promise<string | null> {
  try {
    const { hostname } = new URL(streamUrl);
    // Strip leading "www." so clearbit/google match the brand domain
    const domain = hostname.replace(/^www\./, '');

    // Try Clearbit first — returns a proper logo if one exists
    const clearbitUrl = `https://logo.clearbit.com/${domain}`;
    const res = await fetch(clearbitUrl, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    if (res.ok) return clearbitUrl;

    // Fallback: Google Favicon (always works, lower quality)
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=256`;
  } catch {
    return null;
  }
}

// ─── Station CRUD ─────────────────────────────────────────────────────────────

/** List all saved radio stations for the current user */
router.get('/stations', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const stations = await prisma.radioStation.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    res.json(stations);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** Add a new radio station */
router.post('/stations', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { name, url } = req.body as { name?: string; url?: string };
    if (!name?.trim() || !url?.trim()) {
      res.status(400).json({ error: 'name and url are required' });
      return;
    }

    // Resolve logo in background — don't block the response
    const logoUrl = await resolveStationLogo(url.trim());

    const station = await prisma.radioStation.create({
      data: { userId, name: name.trim(), url: url.trim(), logoUrl },
    });
    res.status(201).json(station);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/** Delete a radio station */
router.delete('/stations/:id', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    await prisma.radioStation.deleteMany({
      where: { id: req.params.id, userId },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ─── Playback / ICY Polling ───────────────────────────────────────────────────

/** Start ICY metadata polling for the current user's radio station */
router.post('/start', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

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
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const track = radioPoller.getCurrentTrack(userId);
    res.json({ track });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

/**
 * SSE endpoint — pushes track changes to the client in real-time.
 */
router.get('/events', async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) { res.status(401).end(); return; }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const current = radioPoller.getCurrentTrack(userId);
  res.write(`data: ${JSON.stringify({ track: current })}\n\n`);

  const send = (track: ParsedTrack | null) => {
    res.write(`data: ${JSON.stringify({ track })}\n\n`);
  };

  radioPoller.subscribe(userId, send);
  req.on('close', () => { radioPoller.unsubscribe(userId, send); });
});

/** Stop ICY metadata polling for the current user */
router.post('/stop', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    radioPoller.stop(userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;
