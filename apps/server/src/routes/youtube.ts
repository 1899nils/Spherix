import { Router, type Request } from 'express';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import { getQuotaStatus } from '../services/metadata/providers/youtube.provider.js';

const router: Router = Router();

/** Resolve user ID from session or fall back to first user in DB. */
async function getUserId(req: Request): Promise<string | null> {
  const sessionUserId = (req.session as unknown as Record<string, unknown>)?.userId as string | undefined;
  if (sessionUserId) return sessionUserId;
  const user = await prisma.user.findFirst({ select: { id: true } });
  return user?.id ?? null;
}

/**
 * GET /api/youtube/status
 * Get YouTube API configuration status
 */
router.get('/status', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated', message: 'Bitte melde dich an' });
      return;
    }

    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { youtubeApiKey: true },
    });

    res.json({
      data: {
        configured: !!settings?.youtubeApiKey,
        apiKey: settings?.youtubeApiKey ? '***' : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/youtube/config
 * Save YouTube API key
 */
router.post('/config', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    logger.debug('YouTube config save attempt', { userId: userId || 'undefined', sessionId: req.sessionID });
    
    if (!userId) {
      res.status(401).json({ 
        error: 'Not authenticated', 
        message: 'Bitte melde dich an, um den API-Key zu speichern' 
      });
      return;
    }

    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string') {
      res.status(400).json({ error: 'API Key is required' });
      return;
    }

    await prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        youtubeApiKey: apiKey,
        theme: 'dark',
      },
      update: {
        youtubeApiKey: apiKey,
      },
    });

    logger.info('YouTube API key saved', { userId });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/youtube/test-config
 * Test YouTube API key (no auth required - key is provided in body)
 */
router.post('/test-config', async (req, res, next) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string') {
      res.status(400).json({ error: 'API Key is required' });
      return;
    }

    // Test the API key with a simple search
    const params = new URLSearchParams({
      part: 'snippet',
      q: 'test',
      type: 'video',
      maxResults: '1',
      key: apiKey,
    });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
      { signal: AbortSignal.timeout(10_000) }
    );

    if (!response.ok) {
      const error = await response.text();
      res.status(400).json({ error: 'Invalid API Key', details: error });
      return;
    }

    res.json({ success: true, message: 'API Key is valid' });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/youtube/config
 * Remove YouTube API key
 */
router.delete('/config', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated', message: 'Bitte melde dich an' });
      return;
    }

    await prisma.userSettings.update({
      where: { userId },
      data: { youtubeApiKey: null },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/youtube/quota
 * Get daily quota status
 */
router.get('/quota', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated', message: 'Bitte melde dich an' });
      return;
    }

    const status = await getQuotaStatus();
    
    res.json({
      data: {
        ...status,
        percentage: Math.round((status.used / status.limit) * 100),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
