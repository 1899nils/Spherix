import { Router } from 'express';
import { requireAdmin } from '../../middleware/requireAdmin.js';
import {
  enqueueVideoScan,
  getVideoScanStatus,
  getVideoScanHistory,
} from '../../services/scanner/videoScannerQueue.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

const router: Router = Router();

/** GET /api/video/scan/status — get current scan status */
router.get('/status', async (_req, res, next) => {
  try {
    const status = await getVideoScanStatus();
    res.json({
      data: {
        ...status,
        videoPath: env.videoPath,
      },
    });
  } catch (error) {
    next(error);
  }
});

/** GET /api/video/scan/history — get scan history */
router.get('/history', async (req, res, next) => {
  try {
    const limit = Math.min(20, parseInt(req.query.limit as string) || 5);
    const history = await getVideoScanHistory(limit);
    res.json({ data: history });
  } catch (error) {
    next(error);
  }
});

/** POST /api/video/scan/trigger — manually trigger a scan (admin only) */
router.post('/trigger', requireAdmin, async (req, res, next) => {
  try {
    const { path: overridePath } = req.body as { path?: string };
    
    const jobId = await enqueueVideoScan(overridePath);
    logger.info(`[VideoScan] Manual scan triggered by user, jobId: ${jobId}`);
    
    res.json({
      data: {
        success: true,
        jobId,
        message: 'Video library scan started',
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
