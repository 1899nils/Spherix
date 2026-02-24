import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import { env } from './config/env.js';
import { redis } from './config/redis.js';
import { connectDatabase } from './config/database.js';
import { logger } from './config/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { startScanWorker, stopScanWorker } from './services/scanner/index.js';
import healthRouter from './routes/health.js';
import tracksRouter from './routes/tracks.js';
import albumsRouter from './routes/albums.js';
import artistsRouter from './routes/artists.js';
import librariesRouter from './routes/libraries.js';
import musicbrainzRouter from './routes/musicbrainz.js';
import playlistsRouter from './routes/playlists.js';
import lastfmRouter from './routes/lastfm.js';
import subsonicRouter from './subsonic/index.js';

const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
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

// Serve cover art from /data/covers as /api/covers/:filename
app.use('/api/covers', express.static('/data/covers', {
  maxAge: '7d',
  immutable: true,
}));

// Routes
app.use('/api/health', healthRouter);
app.use('/api/tracks', tracksRouter);
app.use('/api/albums', albumsRouter);
app.use('/api/artists', artistsRouter);
app.use('/api/libraries', librariesRouter);
app.use('/api/musicbrainz', musicbrainzRouter);
app.use('/api/playlists', playlistsRouter);
app.use('/api/lastfm', lastfmRouter);

// Subsonic API (compatible with Subsonic/Airsonic clients)
app.use('/rest', subsonicRouter);

// Error handling
app.use(errorHandler);

// Start server
async function main() {
  logger.info('Starting Spherix Server...');
  logger.info(`Environment: ${env.nodeEnv}`);
  logger.info(`Database URL: ${env.databaseUrl?.replace(/:[^:@]+@/, ':****@')}`);
  
  await connectDatabase();
  startScanWorker();

  const server = app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port} [${env.nodeEnv}]`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await stopScanWorker();
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
