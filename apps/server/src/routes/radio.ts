import { Router } from 'express';
import { prisma } from '../config/database.js';
import { radioPoller } from '../services/radio/radio-metadata.service.js';

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
