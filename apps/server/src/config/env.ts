import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const sessionSecret = process.env.SESSION_SECRET || 'change-me';

if (
  (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === undefined) &&
  (sessionSecret === 'change-me' || sessionSecret.length < 32)
) {
  // eslint-disable-next-line no-console
  console.error(
    '[Spherix] FATAL: SESSION_SECRET is insecure. ' +
      'Set a random secret of at least 32 characters in your .env file before starting in production.',
  );
  process.exit(1);
}

export const env = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://musicserver:musicserver@localhost:5432/musicserver',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  sessionSecret,
  lastfmApiKey: process.env.LASTFM_API_KEY || '',
  lastfmApiSecret: process.env.LASTFM_API_SECRET || '',
  omdbApiKey: process.env.OMDB_API_KEY || '',
  publicUrl: process.env.PUBLIC_URL || '',
  /** Root for persisted data. Override with DATA_DIR in .env for local dev (e.g. DATA_DIR=./data). */
  dataDir: process.env.DATA_DIR || '/data',
  /** Mount paths for the three media libraries. */
  musicPath:     process.env.MUSIC_PATH     || '/music',
  videoPath:     process.env.VIDEO_PATH     || '/videos',
  audiobookPath: process.env.AUDIOBOOK_PATH || '/audiobooks',
  /**
   * Admin credentials for initial setup / password recovery.
   * If ADMIN_PASSWORD is set (non-empty), the admin user's password is reset
   * on every startup — useful to recover a forgotten password via Docker env.
   * Remove the env var again once you have logged in successfully.
   */
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || '',
} as const;
