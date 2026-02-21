import { Router } from 'express';
import { prisma } from '../config/database.js';
import { enqueueScan, scanQueue } from '../services/scanner/index.js';

const router = Router();

/** List all libraries */
router.get('/', async (_req, res, next) => {
  try {
    const libraries = await prisma.library.findMany({
      orderBy: { name: 'asc' },
    });
    res.json({ data: libraries });
  } catch (error) {
    next(error);
  }
});

/** Create a new library */
router.post('/', async (req, res, next) => {
  try {
    const { name, path } = req.body;
    if (!name || !path) {
      res.status(400).json({ error: 'name and path are required', statusCode: 400 });
      return;
    }

    const library = await prisma.library.create({
      data: { name, path },
    });
    res.status(201).json({ data: library });
  } catch (error) {
    next(error);
  }
});

/** Trigger a scan for a library */
router.post('/:id/scan', async (req, res, next) => {
  try {
    const library = await prisma.library.findUnique({
      where: { id: req.params.id },
    });
    if (!library) {
      res.status(404).json({ error: 'Library not found', statusCode: 404 });
      return;
    }

    const jobId = await enqueueScan(library.id);
    res.json({ data: { jobId, message: 'Scan queued' } });
  } catch (error) {
    next(error);
  }
});

/** Get scan job status */
router.get('/:id/scan/status', async (req, res, next) => {
  try {
    const jobs = await scanQueue.getJobs(['active', 'waiting', 'completed', 'failed']);
    const libraryJobs = jobs
      .filter((j) => j.data.libraryId === req.params.id)
      .map((j) => ({
        jobId: j.id,
        status: j.finishedOn
          ? j.failedReason ? 'failed' : 'completed'
          : j.processedOn ? 'active' : 'waiting',
        result: j.returnvalue,
        failedReason: j.failedReason,
      }));

    res.json({ data: libraryJobs });
  } catch (error) {
    next(error);
  }
});

export default router;
