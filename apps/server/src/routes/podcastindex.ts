import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../config/database.js';

const router: Router = Router();

async function getUserId(req: any): Promise<string | null> {
  if (req.session?.userId) return req.session.userId as string;
  const user = await prisma.user.findFirst({ select: { id: true } });
  return user?.id ?? null;
}

/** GET /api/podcastindex/status */
router.get('/status', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      res.json({ data: { configured: false, apiKey: null, secretConfigured: false } });
      return;
    }
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { podcastIndexApiKey: true, podcastIndexApiSecret: true },
    });
    res.json({
      data: {
        configured: !!settings?.podcastIndexApiKey && !!settings?.podcastIndexApiSecret,
        apiKey: settings?.podcastIndexApiKey ?? null,
        secretConfigured: !!settings?.podcastIndexApiSecret,
      },
    });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/podcastindex/config */
router.post('/config', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Nicht angemeldet' });
      return;
    }
    const { apiKey, apiSecret } = req.body as { apiKey?: string; apiSecret?: string };
    if (!apiKey) {
      res.status(400).json({ error: 'API Key ist erforderlich' });
      return;
    }

    const updateData: Record<string, string> = { podcastIndexApiKey: apiKey.trim() };
    // Only overwrite secret if a new one was provided
    if (apiSecret && apiSecret.trim()) {
      updateData.podcastIndexApiSecret = apiSecret.trim();
    } else {
      // Check if a secret already exists — if not, require it
      const existing = await prisma.userSettings.findUnique({
        where: { userId },
        select: { podcastIndexApiSecret: true },
      });
      if (!existing?.podcastIndexApiSecret) {
        res.status(400).json({ error: 'API Secret ist erforderlich' });
        return;
      }
    }

    await prisma.userSettings.upsert({
      where:  { userId },
      update: updateData,
      create: { userId, ...updateData },
    });
    res.json({ data: { success: true } });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/podcastindex/test — verify credentials with a real API call */
router.post('/test', async (req, res) => {
  try {
    const userId = await getUserId(req);
    const settings = userId
      ? await prisma.userSettings.findUnique({
          where: { userId },
          select: { podcastIndexApiKey: true, podcastIndexApiSecret: true },
        })
      : null;

    const apiKey    = settings?.podcastIndexApiKey    ?? process.env.PODCASTINDEX_API_KEY ?? '';
    const apiSecret = settings?.podcastIndexApiSecret ?? process.env.PODCASTINDEX_API_SECRET ?? '';

    if (!apiKey || !apiSecret) {
      res.status(400).json({ error: 'Keine API-Keys konfiguriert' });
      return;
    }

    const ts = Math.floor(Date.now() / 1000);
    const hash = crypto.createHash('sha1').update(apiKey + apiSecret + ts).digest('hex');

    const r = await fetch('https://api.podcastindex.org/api/1.0/podcasts/trending?max=1', {
      headers: {
        'User-Agent':    'Spherix/1.0',
        'X-Auth-Key':    apiKey,
        'X-Auth-Date':   String(ts),
        'Authorization': hash,
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (r.status === 401) {
      res.status(401).json({ error: 'Ungültige API-Keys — bitte überprüfen' });
      return;
    }
    if (!r.ok) {
      res.status(502).json({ error: `PodcastIndex API antwortete mit Status ${r.status}` });
      return;
    }

    res.json({ data: { success: true } });
  } catch {
    res.status(502).json({ error: 'PodcastIndex API nicht erreichbar' });
  }
});

export default router;
