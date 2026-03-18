import { Router } from 'express';
import { prisma } from '../config/database.js';
import { validateMdblistApiKey } from '../services/metadata/mdblist.service.js';

const router: Router = Router();

async function getUserId(req: any): Promise<string | null> {
  if (req.session?.userId) return req.session.userId;
  const user = await prisma.user.findFirst({ select: { id: true } });
  return user?.id ?? null;
}

/** GET /api/mdblist/status */
router.get('/status', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.json({ data: { configured: false } }); return; }

    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { mdblistApiKey: true },
    });

    res.json({ data: { configured: !!settings?.mdblistApiKey } });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/mdblist/config — save API key */
router.post('/config', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { apiKey } = req.body as { apiKey?: string };
    if (typeof apiKey !== 'string') {
      res.status(400).json({ error: 'apiKey (string) is required' });
      return;
    }

    await prisma.userSettings.upsert({
      where:  { userId },
      update: { mdblistApiKey: apiKey || null },
      create: { userId, mdblistApiKey: apiKey || null },
    });

    res.json({ data: { configured: !!apiKey } });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/mdblist/test-config — validate key without saving */
router.post('/test-config', async (req, res) => {
  try {
    const { apiKey } = req.body as { apiKey?: string };
    if (!apiKey) { res.status(400).json({ error: 'apiKey is required' }); return; }

    const valid = await validateMdblistApiKey(apiKey);
    if (valid) {
      res.json({ data: { valid: true } });
    } else {
      res.status(400).json({ error: 'Ungültiger MDBList API-Key' });
    }
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
