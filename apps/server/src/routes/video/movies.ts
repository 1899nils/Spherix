import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { streamFile, VIDEO_MIME } from './stream.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import {
  getMovieDetails,
  getMovieEnrichedDetails,
  getMovieCredits,
  fetchGenreMap,
} from '../../services/metadata/tmdb.service.js';
import { fetchMdblistRatings } from '../../services/metadata/mdblist.service.js';
import { fetchTraktRatings } from '../../services/metadata/trakt.service.js';
import { logger } from '../../config/logger.js';

const router: Router = Router();

const genreInclude = { genres: { select: { id: true, name: true } } };

const serializeMovie = (m: Record<string, unknown>) => ({
  ...m,
  fileSize: m.fileSize != null ? String(m.fileSize) : null,
});

// ─── GET /api/video/movies ────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page     as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 30));
    const skip     = (page - 1) * pageSize;
    const sort     = (req.query.sort    as string) || 'title';
    const genreId  =  req.query.genre   as string | undefined;
    const watched  =  req.query.watched as string | undefined;
    const q        =  req.query.q       as string | undefined;
    const unmatched = req.query.unmatched === 'true';

    const where: Record<string, unknown> = {};
    if (genreId)          where.genres  = { some: { id: genreId } };
    if (watched === 'true')  where.watched = true;
    if (watched === 'false') where.watched = false;
    if (q) where.title = { contains: q, mode: 'insensitive' };
    if (unmatched)        where.tmdbId  = null;

    const orderBy =
      sort === 'newest' ? { addedAt:  'desc' as const } :
      sort === 'year'   ? { year:     'desc' as const } :
                          { title:    'asc'  as const };

    const [movies, total] = await Promise.all([
      prisma.movie.findMany({ where, skip, take: pageSize, include: genreInclude, orderBy }),
      prisma.movie.count({ where }),
    ]);

    res.json({
      data:       movies.map(serializeMovie),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) { next(error); }
});

// ─── GET /api/video/movies/unmatched/count ─────────────────────────────────────

router.get('/unmatched/count', async (_req, res, next) => {
  try {
    const count = await prisma.movie.count({
      where: { tmdbId: null },
    });
    res.json({ data: { count } });
  } catch (error) { next(error); }
});

// ─── GET /api/video/movies/:id ────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const movie = await prisma.movie.findUnique({
      where:   { id: req.params.id },
      include: genreInclude,
    });
    if (!movie) { res.status(404).json({ error: 'Movie not found' }); return; }
    res.json({ data: serializeMovie(movie as unknown as Record<string, unknown>) });
  } catch (error) { next(error); }
});

// ─── GET /api/video/movies/:id/credits ───────────────────────────────────────
// Returns TMDB cast & crew on-demand (not stored in DB).

router.get('/:id/credits', async (req, res, next) => {
  try {
    const movie = await prisma.movie.findUnique({
      where:  { id: req.params.id },
      select: { tmdbId: true },
    });
    if (!movie) { res.status(404).json({ error: 'Movie not found' }); return; }
    if (!movie.tmdbId) { res.json({ data: { cast: [], crew: [] } }); return; }

    const apiKey = await getTmdbApiKeyForRequest(req);
    if (!apiKey) { res.json({ data: { cast: [], crew: [] } }); return; }

    const credits = await getMovieCredits(movie.tmdbId, apiKey);
    res.json({ data: credits });
  } catch (error) { next(error); }
});

// ─── POST /api/video/movies/:id/progress ─────────────────────────────────────

router.post('/:id/progress', async (req, res, next) => {
  try {
    const { position } = req.body as { position: number };

    if (typeof position !== 'number' || position < 0) {
      res.status(400).json({ error: 'position must be a non-negative number (seconds)' });
      return;
    }

    const movie = await prisma.movie.findUnique({
      where:  { id: req.params.id },
      select: { runtime: true },
    });
    if (!movie) { res.status(404).json({ error: 'Movie not found' }); return; }

    // Auto-mark watched when within last 5% or 5 minutes of end
    const runtimeSec = (movie.runtime ?? 0) * 60;
    const watched    = runtimeSec > 0 && position >= runtimeSec * 0.95;

    await prisma.movie.update({
      where: { id: req.params.id },
      data:  { watchProgress: Math.floor(position), ...(watched ? { watched: true } : {}) },
    });

    res.json({ ok: true, watched });
  } catch (error) { next(error); }
});

// ─── GET /api/video/movies/:id/mediainfo ─────────────────────────────────────

router.get('/:id/mediainfo', async (req, res, next) => {
  try {
    const movie = await prisma.movie.findUnique({
      where:  { id: req.params.id },
      select: { filePath: true },
    });
    if (!movie) { res.status(404).json({ error: 'Movie not found' }); return; }

    const { probeMedia } = await import('../../services/streaming/mediaInfo.service.js');
    const info = await probeMedia(movie.filePath);
    res.json({ data: info });
  } catch (error) { next(error); }
});

// ─── PATCH /api/video/movies/:id ─────────────────────────────────────────────

router.patch('/:id', async (req, res, next) => {
  try {
    const { title, sortTitle, originalTitle, year, releaseDate, runtime, overview, tagline, studio, network, posterPath, backdropPath, logoPath, imdbId } = req.body;
    const movie = await prisma.movie.update({
      where: { id: req.params.id },
      data: {
        ...(title         !== undefined ? { title }         : {}),
        ...(sortTitle     !== undefined ? { sortTitle }     : {}),
        ...(originalTitle !== undefined ? { originalTitle } : {}),
        ...(year          !== undefined ? { year }          : {}),
        ...(releaseDate   !== undefined ? { releaseDate }   : {}),
        ...(runtime       !== undefined ? { runtime }       : {}),
        ...(overview      !== undefined ? { overview }      : {}),
        ...(tagline       !== undefined ? { tagline }       : {}),
        ...(studio        !== undefined ? { studio }        : {}),
        ...(network       !== undefined ? { network }       : {}),
        ...(posterPath    !== undefined ? { posterPath }    : {}),
        ...(backdropPath  !== undefined ? { backdropPath }  : {}),
        ...(logoPath      !== undefined ? { logoPath }      : {}),
        ...(imdbId        !== undefined ? { imdbId }        : {}),
      },
      include: genreInclude,
    });
    res.json({ data: serializeMovie(movie as unknown as Record<string, unknown>) });
  } catch (error) { next(error); }
});

// ─── GET /api/video/movies/:id/stream ────────────────────────────────────────

router.get('/:id/stream', async (req, res, next) => {
  try {
    const movie = await prisma.movie.findUnique({
      where:  { id: req.params.id },
      select: { filePath: true },
    });
    if (!movie) { res.status(404).json({ error: 'Movie not found' }); return; }

    streamFile(req, res, movie.filePath, VIDEO_MIME);
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

async function syncMovieGenres(
  movieId: string,
  genreIds: number[],
  apiKey: string,
): Promise<void> {
  if (genreIds.length === 0) return;
  const genreMap = await fetchGenreMap('movie', apiKey);

  for (const gid of genreIds) {
    const name = genreMap.get(gid);
    if (!name) continue;
    const genre = await prisma.genre.upsert({
      where: { name },
      update: {},
      create: { name },
      select: { id: true },
    });
    await prisma.movie.update({
      where: { id: movieId },
      data: { genres: { connect: { id: genre.id } } },
    });
  }
}

/**
 * Fetch and store enriched ratings for a movie from TMDB + OMDb.
 * This is called after linking a movie to TMDB and can also be triggered manually.
 */
async function enrichMovieRatings(
  movieId: string,
  tmdbId: number,
  apiKey: string,
): Promise<void> {
  try {
    const enriched = await getMovieEnrichedDetails(tmdbId, apiKey);
    if (!enriched) return;

    const ratingData: Record<string, unknown> = {
      tagline:       enriched.tagline,
      contentRating: enriched.contentRating,
      fskRating:     enriched.fskRating,
    };

    if (enriched.imdbId) {
      ratingData.imdbId = enriched.imdbId;

      const { mdblistApiKey, traktClientId } = await getAdminRatingKeys();

      // Fetch IMDb / RT Tomatometer + Audience / Metacritic from MDBList
      if (mdblistApiKey) {
        const mdblist = await fetchMdblistRatings(enriched.imdbId, mdblistApiKey);
        if (mdblist.imdbRating                  !== null) ratingData.imdbRating                  = mdblist.imdbRating;
        if (mdblist.rottenTomatoesScore         !== null) ratingData.rottenTomatoesScore         = mdblist.rottenTomatoesScore;
        if (mdblist.rottenTomatoesAudienceScore !== null) ratingData.rottenTomatoesAudienceScore = mdblist.rottenTomatoesAudienceScore;
        if (mdblist.metacriticScore             !== null) ratingData.metacriticScore             = mdblist.metacriticScore;
        if (mdblist.letterboxdScore             !== null) ratingData.letterboxdScore             = mdblist.letterboxdScore;
        ratingData.ratingsUpdatedAt = new Date();
      }

      // Fetch Trakt community rating
      if (traktClientId) {
        const trakt = await fetchTraktRatings(enriched.imdbId, traktClientId);
        if (trakt.rating !== null) ratingData.traktRating = trakt.rating;
        if (trakt.votes  !== null) ratingData.traktVotes  = trakt.votes;
      }
    }

    await prisma.movie.update({
      where: { id: movieId },
      data: ratingData as Parameters<typeof prisma.movie.update>[0]['data'],
    });
  } catch (e) {
    logger.warn(`Failed to enrich ratings for movie ${movieId}`, { error: String(e) });
  }
}

/** POST /api/video/movies/:id/link-tmdb — manually link movie to TMDb */
router.post('/:id/link-tmdb', requireAuth, async (req, res, next) => {
  try {
    const { tmdbId } = req.body as { tmdbId: number };
    if (!tmdbId || typeof tmdbId !== 'number') {
      res.status(400).json({ error: 'tmdbId (number) is required' });
      return;
    }

    const movie = await prisma.movie.findUnique({
      where: { id: req.params.id as string },
      include: { genres: true },
    });
    if (!movie) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }

    // Check if this TMDB ID is already linked to another movie
    const existing = await prisma.movie.findFirst({
      where: { tmdbId, NOT: { id: movie.id } },
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

    // Fetch details from TMDb (base details for poster/backdrop/genres)
    const details = await getMovieDetails(tmdbId, apiKey);
    if (!details) {
      res.status(404).json({ error: 'Movie not found on TMDb' });
      return;
    }

    // Download poster if available
    let posterPath = movie.posterPath;
    if (details.posterPath && !posterPath) {
      try {
        const { downloadAndSaveCover } = await import('../../services/metadata/cover-processing.service.js');
        const saved = await downloadAndSaveCover(details.posterPath, movie.id);
        if (saved) posterPath = saved.url500;
      } catch (e) {
        logger.warn(`Failed to download poster for movie ${movie.id}`, { error: String(e) });
      }
    }

    // Update movie with TMDb data
    const updated = await prisma.movie.update({
      where: { id: movie.id },
      data: {
        tmdbId: details.tmdbId,
        overview: details.overview || movie.overview,
        posterPath: posterPath || details.posterPath,
        backdropPath: details.backdropPath || movie.backdropPath,
        rating: details.rating || movie.rating,
        year: details.year || movie.year,
      },
      include: genreInclude,
    });

    // Sync genres
    await syncMovieGenres(movie.id, details.genreIds, apiKey);

    // Enrich ratings in the background (non-blocking)
    enrichMovieRatings(movie.id, tmdbId, apiKey).catch(() => {});

    logger.info(`Manually linked movie "${movie.title}" to TMDb ID ${tmdbId}`);
    res.json({ data: serializeMovie(updated as unknown as Record<string, unknown>) });
  } catch (error) {
    next(error);
  }
});

/** POST /api/video/movies/:id/unlink-tmdb — remove TMDb link */
router.post('/:id/unlink-tmdb', requireAuth, async (req, res, next) => {
  try {
    const movie = await prisma.movie.findUnique({
      where: { id: req.params.id as string },
    });
    if (!movie) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }

    const updated = await prisma.movie.update({
      where: { id: movie.id },
      data: {
        tmdbId:              null,
        imdbId:              null,
        overview:            null,
        tagline:             null,
        backdropPath:        null,
        rating:              null,
        imdbRating:          null,
        rottenTomatoesScore: null,
        metacriticScore:     null,
        traktRating:         null,
        traktVotes:          null,
        contentRating:       null,
      },
      include: genreInclude,
    });

    // Disconnect all genres
    await prisma.movie.update({
      where: { id: movie.id },
      data: { genres: { set: [] } },
    });

    logger.info(`Unlinked movie "${movie.title}" from TMDb`);
    res.json({ data: serializeMovie(updated as unknown as Record<string, unknown>) });
  } catch (error) {
    next(error);
  }
});

/** POST /api/video/movies/:id/refresh-ratings — re-fetch ratings from TMDB + OMDb */
router.post('/:id/refresh-ratings', requireAuth, async (req, res, next) => {
  try {
    const movie = await prisma.movie.findUnique({
      where:  { id: req.params.id as string },
      select: { id: true, title: true, tmdbId: true },
    });
    if (!movie) { res.status(404).json({ error: 'Movie not found' }); return; }
    if (!movie.tmdbId) {
      res.status(400).json({ error: 'Movie is not linked to TMDb' });
      return;
    }

    const apiKey = await getTmdbApiKeyForRequest(req);
    if (!apiKey) {
      res.status(400).json({ error: 'TMDb API key not configured' });
      return;
    }

    await enrichMovieRatings(movie.id, movie.tmdbId, apiKey);

    const updated = await prisma.movie.findUnique({
      where:   { id: movie.id },
      include: genreInclude,
    });
    res.json({ data: serializeMovie(updated as unknown as Record<string, unknown>) });
  } catch (error) { next(error); }
});

export default router;
