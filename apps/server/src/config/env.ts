import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

export const env = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://musicserver:musicserver@localhost:5432/musicserver',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  sessionSecret: process.env.SESSION_SECRET || 'change-me',
  lastfmApiKey: process.env.LASTFM_API_KEY || '',
  lastfmApiSecret: process.env.LASTFM_API_SECRET || '',
  publicUrl: process.env.PUBLIC_URL || '',
  /** Root for persisted data. Override with DATA_DIR in .env for local dev (e.g. DATA_DIR=./data). */
  dataDir: process.env.DATA_DIR || '/data',
  /** Mount paths for the three media libraries. */
  musicPath:     process.env.MUSIC_PATH     || '/music',
  videoPath:     process.env.VIDEO_PATH     || '/videos',
  audiobookPath: process.env.AUDIOBOOK_PATH || '/audiobooks',
} as const;
