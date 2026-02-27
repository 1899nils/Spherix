import { Router } from 'express';
import { redis } from '../config/redis.js';
import { prisma } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const router: Router = Router();

const SETTINGS_KEY = 'server:settings';

export interface ServerSettings {
  publicUrl: string;
}

/**
 * Read server settings from Redis, falling back to env defaults.
 */
export async function getServerSettings(): Promise<ServerSettings> {
  try {
    const raw = await redis.get(SETTINGS_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<ServerSettings>;
      return {
        publicUrl: stored.publicUrl ?? env.publicUrl,
      };
    }
  } catch {
    // Redis unavailable — use env defaults
  }
  return {
    publicUrl: env.publicUrl,
  };
}

/**
 * GET /api/settings
 * Returns server settings + read-only server info + library stats.
 */
router.get('/', async (_req, res, next) => {
  try {
    const settings = await getServerSettings();

    // Read-only server info
    const redisStatus = redis.status === 'ready' ? 'ok' : 'error';
    let dbStatus = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    // Statistics
    const [albumCount, trackCount, artistCount] = await Promise.all([
      prisma.album.count(),
      prisma.track.count(),
      prisma.artist.count(),
    ]);

    res.json({
      data: {
        // Editable settings
        publicUrl: settings.publicUrl,
        // Read-only server info
        server: {
          port: env.port,
          nodeEnv: env.nodeEnv,
          databaseStatus: dbStatus,
          redisStatus,
        },
        // Stats
        stats: {
          albums: albumCount,
          tracks: trackCount,
          artists: artistCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/settings
 * Update editable server settings (stored in Redis).
 */
router.put('/', async (req, res, next) => {
  try {
    const { publicUrl } = req.body;

    const current = await getServerSettings();
    const updated: ServerSettings = {
      publicUrl: publicUrl !== undefined ? String(publicUrl).trim() : current.publicUrl,
    };

    await redis.set(SETTINGS_KEY, JSON.stringify(updated));
    logger.info('Server settings updated', { publicUrl: updated.publicUrl });

    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
});

export default router;
