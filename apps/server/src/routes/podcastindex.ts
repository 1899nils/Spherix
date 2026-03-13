import { Router } from 'express';
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
      res.json({ data: { configured: false, apiKey: null } });
      return;
    }
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { podcastIndexApiKey: true },
    });
    res.json({
      data: {
        configured: !!settings?.podcastIndexApiKey,
        apiKey: settings?.podcastIndexApiKey ?? null,
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
    if (!apiKey || !apiSecret) {
      res.status(400).json({ error: 'API Key und API Secret sind erforderlich' });
      return;
    }
    await prisma.userSettings.upsert({
      where:  { userId },
      update: { podcastIndexApiKey: apiKey.trim(), podcastIndexApiSecret: apiSecret.trim() },
      create: { userId, podcastIndexApiKey: apiKey.trim(), podcastIndexApiSecret: apiSecret.trim() },
    });
    res.json({ data: { success: true } });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
