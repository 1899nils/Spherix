import { Router } from 'express';
import { prisma } from '../config/database.js';
import { redis } from '../config/redis.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const redisStatus = redis.status === 'ready' ? 'ok' : 'error';

    res.json({
      status: 'ok',
      services: {
        database: 'ok',
        redis: redisStatus,
      },
    });
  } catch {
    res.status(503).json({
      status: 'error',
      services: {
        database: 'error',
        redis: redis.status === 'ready' ? 'ok' : 'error',
      },
    });
  }
});

export default router;
