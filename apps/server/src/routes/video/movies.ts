import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { streamFile, VIDEO_MIME } from './stream.js';

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

    const where: Record<string, unknown> = {};
    if (genreId)          where.genres  = { some: { id: genreId } };
    if (watched === 'true')  where.watched = true;
    if (watched === 'false') where.watched = false;
    if (q) where.title = { contains: q, mode: 'insensitive' };

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

export default router;
