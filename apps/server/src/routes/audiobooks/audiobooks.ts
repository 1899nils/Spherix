import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { streamAudio } from './stream.js';

const router: Router = Router();

const genreInclude = { genres: { select: { id: true, name: true } } };

const serializeBook = (b: Record<string, unknown>) => ({
  ...b,
  duration: b.duration ?? null,
});

// ─── GET /api/audiobooks ──────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page     as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 30));
    const skip     = (page - 1) * pageSize;
    const sort     = (req.query.sort   as string) || 'title';
    const genreId  =  req.query.genre  as string | undefined;
    const author   =  req.query.author as string | undefined;
    const q        =  req.query.q      as string | undefined;

    const where: Record<string, unknown> = {};
    if (genreId) where.genres  = { some: { id: genreId } };
    if (author)  where.author  = { contains: author, mode: 'insensitive' };
    if (q)       where.title   = { contains: q,      mode: 'insensitive' };

    const orderBy =
      sort === 'newest' ? { addedAt: 'desc' as const } :
      sort === 'author' ? { author:  'asc'  as const } :
                          { title:   'asc'  as const };

    const [books, total] = await Promise.all([
      prisma.audiobook.findMany({
        where,
        skip,
        take: pageSize,
        include: { ...genreInclude, _count: { select: { chapters: true } } },
        orderBy,
      }),
      prisma.audiobook.count({ where }),
    ]);

    res.json({
      data:       books.map(b => serializeBook(b as unknown as Record<string, unknown>)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) { next(error); }
});

// ─── GET /api/audiobooks/recent ───────────────────────────────────────────────

router.get('/recent', async (req, res, next) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const books = await prisma.audiobook.findMany({
      take:    limit,
      include: genreInclude,
      orderBy: { addedAt: 'desc' },
    });
    res.json({ data: books });
  } catch (error) { next(error); }
});

// ─── GET /api/audiobooks/continue ────────────────────────────────────────────

router.get('/continue', async (req, res, next) => {
  try {
    const books = await prisma.audiobook.findMany({
      where:   { listenProgress: { gt: 0 } },
      include: genreInclude,
      orderBy: { updatedAt: 'desc' },
      take:    20,
    });
    res.json({ data: books });
  } catch (error) { next(error); }
});

// ─── GET /api/audiobooks/authors ──────────────────────────────────────────────

router.get('/authors', async (req, res, next) => {
  try {
    const q = req.query.q as string | undefined;

    const authors = await prisma.audiobook.groupBy({
      by:      ['author'],
      where:   {
        author: {
          not:      null,
          ...(q ? { contains: q, mode: 'insensitive' } : {}),
        },
      },
      orderBy: { author: 'asc' },
      _count:  { author: true },
    });

    res.json({
      data: authors
        .filter(a => a.author != null)
        .map(a => ({ name: a.author as string, count: a._count.author })),
    });
  } catch (error) { next(error); }
});

// ─── GET /api/audiobooks/genres ───────────────────────────────────────────────

router.get('/genres', async (req, res, next) => {
  try {
    const genres = await prisma.genre.findMany({
      where:   { audiobooks: { some: {} } },
      select:  { id: true, name: true, _count: { select: { audiobooks: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ data: genres.map(g => ({ id: g.id, name: g.name, count: g._count.audiobooks })) });
  } catch (error) { next(error); }
});

// ─── GET /api/audiobooks/:id ──────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const book = await prisma.audiobook.findUnique({
      where:   { id: req.params.id },
      include: {
        ...genreInclude,
        chapters: { orderBy: { number: 'asc' } },
      },
    });
    if (!book) { res.status(404).json({ error: 'Audiobook not found' }); return; }
    res.json({ data: serializeBook(book as unknown as Record<string, unknown>) });
  } catch (error) { next(error); }
});

// ─── POST /api/audiobooks/:id/progress ───────────────────────────────────────

router.post('/:id/progress', async (req, res, next) => {
  try {
    const { position } = req.body as { position: number };

    if (typeof position !== 'number' || position < 0) {
      res.status(400).json({ error: 'position must be a non-negative number (seconds)' });
      return;
    }

    const book = await prisma.audiobook.findUnique({
      where:  { id: req.params.id },
      select: { id: true },
    });
    if (!book) { res.status(404).json({ error: 'Audiobook not found' }); return; }

    await prisma.audiobook.update({
      where: { id: req.params.id },
      data:  { listenProgress: Math.floor(position) },
    });

    res.json({ ok: true });
  } catch (error) { next(error); }
});

// ─── GET /api/audiobooks/:id/stream ──────────────────────────────────────────
// Streams the audiobook's single file (if not split into chapters)

router.get('/:id/stream', async (req, res, next) => {
  try {
    const book = await prisma.audiobook.findUnique({
      where:  { id: req.params.id },
      select: { filePath: true },
    });
    if (!book)          { res.status(404).json({ error: 'Audiobook not found' }); return; }
    if (!book.filePath) { res.status(404).json({ error: 'No audio file attached to this audiobook' }); return; }

    streamAudio(req, res, book.filePath);
  } catch (error) { next(error); }
});

// ─── GET /api/audiobooks/chapters/:id/stream ─────────────────────────────────
// Streams an individual chapter file

router.get('/chapters/:id/stream', async (req, res, next) => {
  try {
    const chapter = await prisma.audiobookChapter.findUnique({
      where:  { id: req.params.id },
      select: { filePath: true, title: true },
    });
    if (!chapter)          { res.status(404).json({ error: 'Chapter not found' }); return; }
    if (!chapter.filePath) { res.status(404).json({ error: 'No file attached to this chapter' }); return; }

    streamAudio(req, res, chapter.filePath);
  } catch (error) { next(error); }
});

export default router;
