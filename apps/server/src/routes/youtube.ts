import { Router } from 'express';
import { prisma } from '../config/database.js';

const router: Router = Router();

/**
 * GET /api/youtube/status
 * Get YouTube API configuration status
 */
router.get('/status', async (req, res, next) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
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
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
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

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/youtube/test-config
 * Test YouTube API key
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
    const userId = req.session?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
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

export default router;
