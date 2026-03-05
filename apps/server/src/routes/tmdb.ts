import { Router } from 'express';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import {
  validateApiKey,
  searchMoviesMultiple,
  searchSeriesMultiple,
  getMovieDetails,
  getSeriesDetails,
} from '../services/metadata/tmdb.service.js';

const router: Router = Router();

async function getUserId(req: any) {
  if (req.session?.userId) return req.session.userId;
  const user = await prisma.user.findFirst({ select: { id: true } });
  return user?.id || null;
}

async function getTmdbApiKey(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { tmdbApiKey: true },
  });
  return settings?.tmdbApiKey ?? null;
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

// ═══════════════════════════════════════════════════════════════════════════════
// Manual Search Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

/** GET /api/tmdb/search/movies — search for movies by title */
router.get('/search/movies', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const apiKey = await getTmdbApiKey(userId);

    if (!apiKey) {
      res.status(400).json({ error: 'TMDb API key not configured' });
      return;
    }

    const query = req.query.q as string;
    const year = req.query.year ? parseInt(req.query.year as string, 10) : null;
    const limit = Math.min(20, parseInt(req.query.limit as string) || 10);

    if (!query || query.trim().length < 2) {
      res.status(400).json({ error: 'Query must be at least 2 characters' });
      return;
    }

    const results = await searchMoviesMultiple(query.trim(), year, apiKey, limit);
    res.json({ data: results });
  } catch (error) {
    next(error);
  }
});

/** GET /api/tmdb/search/series — search for TV series by title */
router.get('/search/series', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const apiKey = await getTmdbApiKey(userId);

    if (!apiKey) {
      res.status(400).json({ error: 'TMDb API key not configured' });
      return;
    }

    const query = req.query.q as string;
    const year = req.query.year ? parseInt(req.query.year as string, 10) : null;
    const limit = Math.min(20, parseInt(req.query.limit as string) || 10);

    if (!query || query.trim().length < 2) {
      res.status(400).json({ error: 'Query must be at least 2 characters' });
      return;
    }

    const results = await searchSeriesMultiple(query.trim(), year, apiKey, limit);
    res.json({ data: results });
  } catch (error) {
    next(error);
  }
});

/** GET /api/tmdb/movie/:id — get movie details by TMDB ID */
router.get('/movie/:id', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const apiKey = await getTmdbApiKey(userId);

    if (!apiKey) {
      res.status(400).json({ error: 'TMDb API key not configured' });
      return;
    }

    const tmdbId = parseInt(req.params.id, 10);
    if (isNaN(tmdbId)) {
      res.status(400).json({ error: 'Invalid TMDB ID' });
      return;
    }

    const result = await getMovieDetails(tmdbId, apiKey);
    if (!result) {
      res.status(404).json({ error: 'Movie not found on TMDb' });
      return;
    }

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

/** GET /api/tmdb/series/:id — get series details by TMDB ID */
router.get('/series/:id', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    const apiKey = await getTmdbApiKey(userId);

    if (!apiKey) {
      res.status(400).json({ error: 'TMDb API key not configured' });
      return;
    }

    const tmdbId = parseInt(req.params.id, 10);
    if (isNaN(tmdbId)) {
      res.status(400).json({ error: 'Invalid TMDB ID' });
      return;
    }

    const result = await getSeriesDetails(tmdbId, apiKey);
    if (!result) {
      res.status(404).json({ error: 'Series not found on TMDb' });
      return;
    }

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
