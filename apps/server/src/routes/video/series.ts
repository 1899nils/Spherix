import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { streamFile, VIDEO_MIME } from './stream.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import {
  getSeriesDetails,
  getSeriesEnrichedDetails,
  getSeriesExternalData,
  fetchGenreMap,
} from '../../services/metadata/tmdb.service.js';
import { fetchMdblistRatings } from '../../services/metadata/mdblist.service.js';
import { fetchTraktRatings } from '../../services/metadata/trakt.service.js';
import { logger } from '../../config/logger.js';

// Two routers exported:
//   seriesRouter   → mounted at /api/video/series
//   episodesRouter → mounted at /api/video/episodes
export const seriesRouter: Router   = Router();
export const episodesRouter: Router = Router();

const genreInclude = { genres: { select: { id: true, name: true } } };

// ─── GET /api/video/series ────────────────────────────────────────────────────

seriesRouter.get('/', async (req, res, next) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page     as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 30));
    const skip     = (page - 1) * pageSize;
    const sort     = (req.query.sort   as string) || 'title';
    const genreId  =  req.query.genre  as string | undefined;
    const q        =  req.query.q      as string | undefined;
    const unmatched = req.query.unmatched === 'true';

    const where: Record<string, unknown> = {};
    if (genreId) where.genres = { some: { id: genreId } };
    if (q)       where.title  = { contains: q, mode: 'insensitive' };
    if (unmatched) where.tmdbId = null;

    const orderBy =
      sort === 'newest' ? { addedAt: 'desc' as const } :
      sort === 'year'   ? { year:    'desc' as const } :
                          { title:   'asc'  as const };

    const [series, total] = await Promise.all([
      prisma.series.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          ...genreInclude,
          _count: { select: { seasons: true } },
        },
        orderBy,
      }),
      prisma.series.count({ where }),
    ]);

    res.json({ data: series, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) { next(error); }
});

// ─── GET /api/video/series/unmatched/count ─────────────────────────────────────

seriesRouter.get('/unmatched/count', async (_req, res, next) => {
  try {
    const count = await prisma.series.count({
      where: { tmdbId: null },
    });
    res.json({ data: { count } });
  } catch (error) { next(error); }
});

// ─── GET /api/video/series/:id ────────────────────────────────────────────────
// Returns full series with seasons and episodes

seriesRouter.get('/:id', async (req, res, next) => {
  try {
    const series = await prisma.series.findUnique({
      where:   { id: req.params.id },
      include: {
        ...genreInclude,
        seasons: {
          orderBy: { number: 'asc' },
          include: {
            episodes: {
              orderBy: { number: 'asc' },
              select: {
                id:            true,
                title:         true,
                number:        true,
                seasonId:      true,
                overview:      true,
                runtime:       true,
                thumbnailPath: true,
                watched:       true,
                watchProgress: true,
                addedAt:       true,
                // exclude filePath from list view for security
              },
            },
          },
        },
      },
    });

    if (!series) { res.status(404).json({ error: 'Series not found' }); return; }
    res.json({ data: series });
  } catch (error) { next(error); }
});

// ─── PATCH /api/video/series/:id ─────────────────────────────────────────────

seriesRouter.patch('/:id', async (req, res, next) => {
  try {
    const { title, sortTitle, originalTitle, year, releaseDate, overview, studio, network, posterPath, backdropPath, logoPath, imdbId } = req.body;
    const series = await prisma.series.update({
      where: { id: req.params.id },
      data: {
        ...(title         !== undefined ? { title }         : {}),
        ...(sortTitle     !== undefined ? { sortTitle }     : {}),
        ...(originalTitle !== undefined ? { originalTitle } : {}),
        ...(year          !== undefined ? { year }          : {}),
        ...(releaseDate   !== undefined ? { releaseDate }   : {}),
        ...(overview      !== undefined ? { overview }      : {}),
        ...(studio        !== undefined ? { studio }        : {}),
        ...(network       !== undefined ? { network }       : {}),
        ...(posterPath    !== undefined ? { posterPath }    : {}),
        ...(backdropPath  !== undefined ? { backdropPath }  : {}),
        ...(logoPath      !== undefined ? { logoPath }      : {}),
        ...(imdbId        !== undefined ? { imdbId }        : {}),
      },
      include: genreInclude,
    });
    res.json({ data: series });
  } catch (error) { next(error); }
});

// ─── GET /api/video/episodes/:id ─────────────────────────────────────────────

episodesRouter.get('/:id', async (req, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where:   { id: req.params.id },
      include: { season: { include: { series: { select: { id: true, title: true } } } } },
    });
    if (!episode) { res.status(404).json({ error: 'Episode not found' }); return; }

    // Omit filePath from detail response
    const { filePath: _fp, ...safe } = episode;
    void _fp;
    res.json({ data: { ...safe, fileSize: safe.fileSize != null ? String(safe.fileSize) : null } });
  } catch (error) { next(error); }
});

// ─── PATCH /api/video/episodes/:id ───────────────────────────────────────────

episodesRouter.patch('/:id', async (req, res, next) => {
  try {
    const { title, number, overview, runtime } = req.body;
    const episode = await prisma.episode.update({
      where: { id: req.params.id },
      data: {
        ...(title    !== undefined ? { title }    : {}),
        ...(number   !== undefined ? { number }   : {}),
        ...(overview !== undefined ? { overview } : {}),
        ...(runtime  !== undefined ? { runtime }  : {}),
      },
    });
    const { filePath: _fp, ...safe } = episode;
    void _fp;
    res.json({ data: { ...safe, fileSize: safe.fileSize != null ? String(safe.fileSize) : null } });
  } catch (error) { next(error); }
});

// ─── POST /api/video/episodes/:id/progress ───────────────────────────────────

episodesRouter.post('/:id/progress', async (req, res, next) => {
  try {
    const { position } = req.body as { position: number };

    if (typeof position !== 'number' || position < 0) {
      res.status(400).json({ error: 'position must be a non-negative number (seconds)' });
      return;
    }

    const episode = await prisma.episode.findUnique({
      where:  { id: req.params.id },
      select: { runtime: true },
    });
    if (!episode) { res.status(404).json({ error: 'Episode not found' }); return; }

    const runtimeSec = (episode.runtime ?? 0) * 60;
    const watched    = runtimeSec > 0 && position >= runtimeSec * 0.95;

    await prisma.episode.update({
      where: { id: req.params.id },
      data:  { watchProgress: Math.floor(position), ...(watched ? { watched: true } : {}) },
    });

    res.json({ ok: true, watched });
  } catch (error) { next(error); }
});

// ─── GET /api/video/episodes/:id/stream ──────────────────────────────────────

episodesRouter.get('/:id/stream', async (req, res, next) => {
  try {
    const episode = await prisma.episode.findUnique({
      where:  { id: req.params.id },
      select: { filePath: true },
    });
    if (!episode) { res.status(404).json({ error: 'Episode not found' }); return; }

    streamFile(req, res, episode.filePath, VIDEO_MIME);
  } catch (error) { next(error); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Manual TMDb Linking (Admin only)
// ═══════════════════════════════════════════════════════════════════════════════

async function getTmdbApiKeyForRequest(req: any): Promise<string | null> {
  const userId = req.session?.userId || (await prisma.user.findFirst({ select: { id: true } }))?.id;
  if (!userId) return null;
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { tmdbApiKey: true },
  });
  return settings?.tmdbApiKey ?? null;
}

async function syncSeriesGenres(
  seriesId: string,
  genreIds: number[],
  apiKey: string,
): Promise<void> {
  if (genreIds.length === 0) return;
  const genreMap = await fetchGenreMap('tv', apiKey);
  
  for (const gid of genreIds) {
    const name = genreMap.get(gid);
    if (!name) continue;
    const genre = await prisma.genre.upsert({
      where: { name },
      update: {},
      create: { name },
      select: { id: true },
    });
    await prisma.series.update({
      where: { id: seriesId },
      data: { genres: { connect: { id: genre.id } } },
    });
  }
}

async function getAdminRatingKeys(): Promise<{ mdblistApiKey: string | null; traktClientId: string | null }> {
  const settings = await prisma.userSettings.findFirst({
    where: { user: { isAdmin: true } },
    select: { mdblistApiKey: true, traktClientId: true },
  });
  return {
    mdblistApiKey: settings?.mdblistApiKey ?? null,
    traktClientId: settings?.traktClientId ?? null,
  };
}

/**
 * Fetch and store MDBList + Trakt ratings for a series.
 * Requires the series to already have an imdbId stored.
 */
async function enrichSeriesRatings(seriesId: string, imdbId: string): Promise<void> {
  try {
    const { mdblistApiKey, traktClientId } = await getAdminRatingKeys();
    const data: Record<string, unknown> = {};

    if (mdblistApiKey) {
      const mdblist = await fetchMdblistRatings(imdbId, mdblistApiKey);
      if (mdblist.imdbRating                  !== null) data.imdbRating                  = mdblist.imdbRating;
      if (mdblist.rottenTomatoesScore         !== null) data.rottenTomatoesScore         = mdblist.rottenTomatoesScore;
      if (mdblist.rottenTomatoesAudienceScore !== null) data.rottenTomatoesAudienceScore = mdblist.rottenTomatoesAudienceScore;
      if (mdblist.metacriticScore             !== null) data.metacriticScore             = mdblist.metacriticScore;
      if (mdblist.letterboxdScore             !== null) data.letterboxdScore             = mdblist.letterboxdScore;
      data.ratingsUpdatedAt = new Date();
    }

    if (traktClientId) {
      const trakt = await fetchTraktRatings(imdbId, traktClientId);
      if (trakt.rating !== null) data.traktRating = trakt.rating;
      if (trakt.votes  !== null) data.traktVotes  = trakt.votes;
    }

    if (Object.keys(data).length > 0) {
      await prisma.series.update({
        where: { id: seriesId },
        data: data as Parameters<typeof prisma.series.update>[0]['data'],
      });
    }
  } catch (e) {
    logger.warn(`Failed to enrich ratings for series ${seriesId}`, { error: String(e) });
  }
}

/** POST /api/video/series/:id/link-tmdb — manually link series to TMDb */
seriesRouter.post('/:id/link-tmdb', requireAuth, async (req, res, next) => {
  try {
    const { tmdbId } = req.body as { tmdbId: number };
    if (!tmdbId || typeof tmdbId !== 'number') {
      res.status(400).json({ error: 'tmdbId (number) is required' });
      return;
    }

    const series = await prisma.series.findUnique({
      where: { id: req.params.id as string },
      include: { genres: true },
    });
    if (!series) {
      res.status(404).json({ error: 'Series not found' });
      return;
    }

    // Check if this TMDB ID is already linked to another series
    const existing = await prisma.series.findFirst({
      where: { tmdbId, NOT: { id: series.id } },
      select: { id: true, title: true },
    });
    if (existing) {
      res.status(409).json({
        error: `This TMDb ID is already linked to "${existing.title}"`,
      });
      return;
    }

    const apiKey = await getTmdbApiKeyForRequest(req);
    if (!apiKey) {
      res.status(400).json({ error: 'TMDb API key not configured' });
      return;
    }

    // Fetch enriched details from TMDb (all fields in parallel)
    const details = await getSeriesEnrichedDetails(tmdbId, apiKey);
    if (!details) {
      res.status(404).json({ error: 'Series not found on TMDb' });
      return;
    }

    // Download poster if available
    let posterPath = series.posterPath;
    if (details.posterPath && !posterPath) {
      try {
        const { downloadAndSaveCover } = await import('../../services/metadata/cover-processing.service.js');
        const saved = await downloadAndSaveCover(details.posterPath, series.id);
        if (saved) posterPath = saved.url500;
      } catch (e) {
        logger.warn(`Failed to download poster for series ${series.id}`, { error: String(e) });
      }
    }

    // Update series with all enriched TMDb data
    const updated = await prisma.series.update({
      where: { id: series.id },
      data: {
        tmdbId:        details.tmdbId,
        imdbId:        details.imdbId        ?? series.imdbId,
        originalTitle: details.originalTitle ?? series.originalTitle,
        releaseDate:   details.releaseDate   ?? series.releaseDate,
        overview:      details.overview      || series.overview,
        posterPath:    posterPath            || details.posterPath,
        backdropPath:  details.backdropPath  || series.backdropPath,
        logoPath:      details.logoPath      ?? series.logoPath,
        rating:        details.rating        || series.rating,
        year:          details.year          || series.year,
        contentRating: details.contentRating ?? series.contentRating,
        fskRating:     details.fskRating     ?? series.fskRating,
        studio:        details.studio        ?? series.studio,
        network:       details.network       ?? series.network,
      },
      include: genreInclude,
    });

    // Sync genres
    await syncSeriesGenres(series.id, details.genreIds, apiKey);

    // Enrich ratings in the background
    if (details.imdbId) {
      enrichSeriesRatings(series.id, details.imdbId).catch(() => {});
    }

    logger.info(`Manually linked series "${series.title}" to TMDb ID ${tmdbId}`);
    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
});

/** POST /api/video/series/:id/unlink-tmdb — remove TMDb link */
seriesRouter.post('/:id/unlink-tmdb', requireAuth, async (req, res, next) => {
  try {
    const series = await prisma.series.findUnique({
      where: { id: req.params.id as string },
    });
    if (!series) {
      res.status(404).json({ error: 'Series not found' });
      return;
    }

    const updated = await prisma.series.update({
      where: { id: series.id },
      data: {
        tmdbId:                      null,
        imdbId:                      null,
        originalTitle:               null,
        releaseDate:                 null,
        overview:                    null,
        backdropPath:                null,
        logoPath:                    null,
        studio:                      null,
        network:                     null,
        rating:                      null,
        imdbRating:                  null,
        rottenTomatoesScore:         null,
        rottenTomatoesAudienceScore: null,
        metacriticScore:             null,
        traktRating:                 null,
        traktVotes:                  null,
        letterboxdScore:             null,
        contentRating:               null,
        fskRating:                   null,
        ratingsUpdatedAt:            null,
        ratingsNextRetry:            null,
      },
      include: genreInclude,
    });

    // Disconnect all genres
    await prisma.series.update({
      where: { id: series.id },
      data: { genres: { set: [] } },
    });

    logger.info(`Unlinked series "${series.title}" from TMDb`);
    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
});
