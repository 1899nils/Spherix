import { Router } from 'express';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import { validateApiKey } from '../services/metadata/tmdb.service.js';

const router: Router = Router();

async function getUserId(req: any) {
  if (req.session?.userId) return req.session.userId;
  const user = await prisma.user.findFirst({ select: { id: true } });
  return user?.id || null;
}

/** GET /api/tmdb/status — return current config */
router.get('/status', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      res.json({ data: { configured: false, apiKey: null } });
      return;
    }

    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { tmdbApiKey: true },
    });

    res.json({
      data: {
        configured: !!settings?.tmdbApiKey,
        apiKey: settings?.tmdbApiKey ?? null,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/tmdb/config — save API key */
router.post('/config', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { apiKey } = req.body as { apiKey: string };
    if (!apiKey) {
      res.status(400).json({ error: 'apiKey ist erforderlich.' });
      return;
    }

    await prisma.userSettings.upsert({
      where: { userId },
      update: { tmdbApiKey: apiKey },
      create: { userId, tmdbApiKey: apiKey },
    });

    logger.info('TMDb API key saved');
    res.json({ data: { success: true } });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/tmdb/test-config — validate API key without saving */
router.post('/test-config', async (req, res, next) => {
  try {
    const { apiKey } = req.body as { apiKey: string };
    if (!apiKey) {
      res.status(400).json({ error: 'apiKey ist erforderlich.' });
      return;
    }

    await validateApiKey(apiKey);
    res.json({ data: { success: true } });
  } catch (error) {
    next(error);
  }
});

export default router;
