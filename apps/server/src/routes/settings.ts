import { Router, type Request } from 'express';
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

/** Resolve user ID from session or fall back to first user in DB. */
async function getUserId(req: Request): Promise<string | null> {
  const sessionUserId = (req.session as unknown as Record<string, unknown>)?.userId as string | undefined;
  if (sessionUserId) return sessionUserId;
  const user = await prisma.user.findFirst({ select: { id: true } });
  return user?.id ?? null;
}

/** Read media paths from UserSettings, falling back to env defaults. */
export async function getMediaPaths(userId: string | null) {
  const row = userId
    ? await prisma.userSettings.findUnique({
        where: { userId },
        select: { musicPath: true, videoPath: true, audiobookPath: true },
      })
    : null;
  return {
    music:     row?.musicPath     ?? env.musicPath,
    video:     row?.videoPath     ?? env.videoPath,
    audiobook: row?.audiobookPath ?? env.audiobookPath,
  };
}

/**
 * GET /api/settings
 * Returns server settings + read-only server info + library stats.
 */
router.get('/', async (req, res, next) => {
  try {
    const settings = await getServerSettings();
    const userId = await getUserId(req);
    const paths = await getMediaPaths(userId);

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
        // Configurable media paths (UI-editable, env vars are factory defaults)
        paths,
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
 * Update server settings (Redis) and media paths (DB UserSettings).
 */
router.put('/', async (req, res, next) => {
  try {
    const { publicUrl, musicPath, videoPath, audiobookPath } = req.body;

    // Server-level settings → Redis
    const current = await getServerSettings();
    const updated: ServerSettings = {
      publicUrl: publicUrl !== undefined ? String(publicUrl).trim() : current.publicUrl,
    };
    await redis.set(SETTINGS_KEY, JSON.stringify(updated));

    // Media paths → UserSettings in DB
    const userId = await getUserId(req);
    if (userId && (musicPath !== undefined || videoPath !== undefined || audiobookPath !== undefined)) {
      const toVal = (v: unknown) => (v === '' || v == null ? null : String(v).trim());
      await prisma.userSettings.upsert({
        where:  { userId },
        update: {
          ...(musicPath     !== undefined && { musicPath:     toVal(musicPath) }),
          ...(videoPath     !== undefined && { videoPath:     toVal(videoPath) }),
          ...(audiobookPath !== undefined && { audiobookPath: toVal(audiobookPath) }),
        },
        create: {
          userId,
          musicPath:     toVal(musicPath),
          videoPath:     toVal(videoPath),
          audiobookPath: toVal(audiobookPath),
        },
      });
    }

    logger.info('Settings updated', { publicUrl: updated.publicUrl, musicPath, videoPath, audiobookPath });
    const paths = await getMediaPaths(userId);
    res.json({ data: { ...updated, paths } });
  } catch (error) {
    next(error);
  }
});

export default router;
