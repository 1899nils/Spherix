import express from 'express';
import cors from 'cors';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { env } from './config/env.js';
import { redis } from './config/redis.js';
import { connectDatabase } from './config/database.js';
import { logger } from './config/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { startScanWorker, stopScanWorker } from './services/scanner/index.js';
import healthRouter from './routes/health.js';
import tracksRouter from './routes/tracks.js';
import librariesRouter from './routes/libraries.js';

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
      secure: env.nodeEnv === 'production',
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  }),
);

// Routes
app.use('/api/health', healthRouter);
app.use('/api/tracks', tracksRouter);
app.use('/api/libraries', librariesRouter);

// Error handling
app.use(errorHandler);

// Start server
async function main() {
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
