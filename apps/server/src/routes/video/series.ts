import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { streamFile, VIDEO_MIME } from './stream.js';

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

    const where: Record<string, unknown> = {};
    if (genreId) where.genres = { some: { id: genreId } };
    if (q)       where.title  = { contains: q, mode: 'insensitive' };

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
