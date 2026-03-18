import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { RedisStore } from 'connect-redis';
import { env } from './config/env.js';
import { redis } from './config/redis.js';
import { connectDatabase, prisma } from './config/database.js';
import { logger } from './config/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import {
  startScanWorker, stopScanWorker,
  startVideoScanWorker, stopVideoScanWorker, enqueueVideoScan,
  startAudiobookScanWorker, stopAudiobookScanWorker, enqueueAudiobookScan,
} from './services/scanner/index.js';
import healthRouter from './routes/health.js';
import tracksRouter from './routes/tracks.js';
import albumsRouter from './routes/albums.js';
import artistsRouter from './routes/artists.js';
import librariesRouter from './routes/libraries.js';
import musicbrainzRouter from './routes/musicbrainz.js';
import playlistsRouter from './routes/playlists.js';
import lastfmRouter from './routes/lastfm.js';
import tmdbRouter from './routes/tmdb.js';
import traktRouter from './routes/trakt.js';
import radioRouter from './routes/radio.js';
import settingsRouter, { getMediaPaths } from './routes/settings.js';
import podcastsRouter from './routes/podcasts.js';
import podcastIndexRouter from './routes/podcastindex.js';
import moviesRouter from './routes/video/movies.js';
import { seriesRouter, episodesRouter } from './routes/video/series.js';
import videoScanRouter from './routes/video/scan.js';
import streamingRouter from './routes/video/streaming.js';
import sessionsRouter from './routes/video/sessions.js';
import audiobooksRouter from './routes/audiobooks/audiobooks.js';
import musicVideoRouter from './routes/musicvideos.js';
import youtubeRouter from './routes/youtube.js';
import lyricsRouter from './routes/lyrics.js';
import metadataRouter from './routes/metadata.js';
import discoverRouter from './routes/discover.js';
import watchlistRouter from './routes/watchlist.js';
import statsRouter from './routes/stats.js';
import subsonicRouter from './subsonic/index.js';
import authRouter, { hashPassword } from './routes/auth.js';
import mdblistRouter from './routes/mdblist.js';
import { generateCsrfToken, doubleCsrfProtection } from './middleware/csrf.js';
import { startRatingsScheduler, stopRatingsScheduler } from './services/ratings/ratingsScheduler.js';

const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(
  session({
    store: new RedisStore({ client: redis }),
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Allow HTTP (typical for self-hosted setups like Unraid)
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  }),
);

// Serve cover art from {dataDir}/covers as /api/covers/:filename
app.use('/api/covers', express.static(path.join(env.dataDir, 'covers'), {
  maxAge: '7d',
  immutable: true,
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.' },
});

// ── Auth routes (no session required) ────────────────────────────────────────
app.use('/api/auth/login', loginRateLimit);
app.use('/api/auth', authRouter);
app.use('/api/health', healthRouter);

// ── Global API auth guard ─────────────────────────────────────────────────────
// All /api/* routes below this point require an active session.
app.use('/api', (req, res, next) => {
  const userId = (req.session as unknown as Record<string, unknown>).userId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
});

// ── CSRF protection (authenticated routes only) ───────────────────────────────
// Applied after the auth guard so pre-auth endpoints (login, logout, health)
// are never blocked. The /rest Subsonic API uses its own auth and is excluded
// because it is mounted outside /api.
app.use('/api', doubleCsrfProtection);

// ── CSRF token endpoint ───────────────────────────────────────────────────────
// Requires an active session — call this once after login to seed the token.
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: generateCsrfToken(req, res) });
});

// Routes
app.use('/api/tracks', tracksRouter);
app.use('/api/albums', albumsRouter);
app.use('/api/artists', artistsRouter);
app.use('/api/libraries', librariesRouter);
app.use('/api/musicbrainz', musicbrainzRouter);
app.use('/api/playlists', playlistsRouter);
app.use('/api/lastfm', lastfmRouter);
app.use('/api/tmdb', tmdbRouter);
app.use('/api/trakt', traktRouter);
app.use('/api/mdblist', mdblistRouter);
app.use('/api/radio', radioRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/podcasts', podcastsRouter);
app.use('/api/podcastindex', podcastIndexRouter);

// ── Video ─────────────────────────────────────────────────────────────────────
app.use('/api/video/movies',   moviesRouter);
app.use('/api/video/series',   seriesRouter);
app.use('/api/video/episodes', episodesRouter);
app.use('/api/video/scan',       videoScanRouter);
app.use('/api/video/stream',     streamingRouter);
app.use('/api/video/sessions',    sessionsRouter);

// Video overview endpoints: genres, recently added, continue watching
app.get('/api/video/genres', async (_req, res, next) => {
  try {
    const genres = await prisma.genre.findMany({
      where:   { OR: [{ movies: { some: {} } }, { series: { some: {} } }] },
      select:  {
        id: true, name: true,
        _count: { select: { movies: true, series: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({
      data: genres.map(g => ({
        id:    g.id,
        name:  g.name,
        count: g._count.movies + g._count.series,
      })),
    });
  } catch (error) { next(error); }
});

app.get('/api/video/recent', async (req, res, next) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
    const [movies, series] = await Promise.all([
      prisma.movie.findMany({
        take:    limit,
        orderBy: { addedAt: 'desc' },
        include: { genres: { select: { id: true, name: true } } },
      }),
      prisma.series.findMany({
        take:    limit,
        orderBy: { addedAt: 'desc' },
        include: { genres: { select: { id: true, name: true } } },
      }),
    ]);

    // Merge and sort by addedAt, return top `limit` items
    const combined = [
      ...movies.map(m => ({ ...m, fileSize: m.fileSize?.toString() ?? null, type: 'movie'  as const })),
      ...series.map(s => ({                                                   ...s, type: 'series' as const })),
    ].sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime()).slice(0, limit);

    res.json({ data: combined });
  } catch (error) { next(error); }
});

app.get('/api/video/continue', async (_req, res, next) => {
  try {
    const [movies, episodes] = await Promise.all([
      prisma.movie.findMany({
        where:   { watchProgress: { gt: 0 }, watched: false },
        include: { genres: { select: { id: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
        take:    20,
      }),
      prisma.episode.findMany({
        where:   { watchProgress: { gt: 0 }, watched: false },
        include: { season: { include: { series: { select: { id: true, title: true, posterPath: true } } } } },
        orderBy: { addedAt: 'desc' },
        take:    20,
      }),
    ]);
    res.json({
      data: {
        movies:   movies.map(m => ({ ...m, fileSize: m.fileSize?.toString() ?? null })),
        episodes,
      },
    });
  } catch (error) { next(error); }
});

// ── Music Videos ───────────────────────────────────────────────────────────────
app.use('/api/tracks', musicVideoRouter);
app.use('/api/albums', musicVideoRouter);  // For album-level bulk search

// ── Lyrics ─────────────────────────────────────────────────────────────────────
app.use('/api/tracks', lyricsRouter);
app.use('/api/albums', lyricsRouter);

// ── Metadata Orchestration ─────────────────────────────────────────────────────
app.use('/api/metadata', metadataRouter);

// ── YouTube API ────────────────────────────────────────────────────────────────
app.use('/api/youtube', youtubeRouter);

// ── Discover ──────────────────────────────────────────────────────────────────
app.use('/api/discover', discoverRouter);

// ── Watchlist ─────────────────────────────────────────────────────────────────
app.use('/api/watchlist', watchlistRouter);

// ── Audiobooks ────────────────────────────────────────────────────────────────
app.use('/api/audiobooks', audiobooksRouter);

// ── Statistics ────────────────────────────────────────────────────────────────
app.use('/api/stats', statsRouter);

// ── Scan trigger routes (admin) ───────────────────────────────────────────────
app.post('/api/video/scan', async (_req, res, next) => {
  try {
    const paths = await getMediaPaths(null);
    const jobId = await enqueueVideoScan(paths.video);
    res.json({ ok: true, jobId, path: paths.video });
  } catch (error) { next(error); }
});

app.post('/api/audiobooks/scan', async (_req, res, next) => {
  try {
    const paths = await getMediaPaths(null);
    const jobId = await enqueueAudiobookScan(paths.audiobook);
    res.json({ ok: true, jobId, path: paths.audiobook });
  } catch (error) { next(error); }
});

// Subsonic API (compatible with Subsonic/Airsonic clients)
app.use('/rest', subsonicRouter);

// Error handling
app.use(errorHandler);

/**
 * Creates a default admin user on first startup if no users exist yet.
 * If ADMIN_PASSWORD env var is set (non-empty), the admin password is reset
 * on every startup — use this to recover a forgotten password via Docker env.
 */
async function ensureDefaultUser(): Promise<void> {
  const { adminUsername, adminPassword } = env;

  // Password-reset mode: ADMIN_PASSWORD is set → always reset the first admin
  if (adminPassword) {
    const existingAdmin = await prisma.user.findFirst({ where: { isAdmin: true } });
    if (existingAdmin) {
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: { passwordHash: await hashPassword(adminPassword) },
      });
      logger.info(`Admin password reset via ADMIN_PASSWORD env var (user: "${existingAdmin.username}")`);
      logger.warn('Remove ADMIN_PASSWORD from your environment after logging in!');
      return;
    }
  }

  // First-run: create default admin if no users exist
  const count = await prisma.user.count();
  if (count === 0) {
    const password = adminPassword || 'admin';
    await prisma.user.create({
      data: {
        email: `${adminUsername}@spherix.local`,
        username: adminUsername,
        passwordHash: await hashPassword(password),
        isAdmin: true,
      },
    });
    logger.info(`Created default admin user — username: ${adminUsername}, password: ${adminPassword ? '(from ADMIN_PASSWORD env)' : 'admin'}`);
    if (!adminPassword) {
      logger.warn('Please change the default admin password after first login!');
    }
  }
}

// Start server
async function main() {
  logger.info('Starting Spherix Server...');
  logger.info(`Environment: ${env.nodeEnv}`);
  logger.info(`Database URL: ${env.databaseUrl?.replace(/:[^:@]+@/, ':****@')}`);

  await connectDatabase();
  await ensureDefaultUser();
  startScanWorker();
  startVideoScanWorker();
  startAudiobookScanWorker();
  startRatingsScheduler();

  const server = app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port} [${env.nodeEnv}]`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    stopRatingsScheduler();
    await Promise.all([stopScanWorker(), stopVideoScanWorker(), stopAudiobookScanWorker()]);
    server.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
