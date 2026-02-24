import { Router } from 'express';
import { subsonicAuth } from './auth.js';
import systemRouter from './handlers/system.js';
import browsingRouter from './handlers/browsing.js';
import mediaRouter from './handlers/media.js';
import searchRouter from './handlers/search.js';
import albumListsRouter from './handlers/albumLists.js';
import annotationRouter from './handlers/annotation.js';
import playlistsRouter from './handlers/playlists.js';

const router = Router();

// Auth middleware applies to all Subsonic endpoints
router.use(subsonicAuth);

// Mount all handler groups (endpoints are flat under /rest/)
router.use(systemRouter);
router.use(browsingRouter);
router.use(mediaRouter);
router.use(searchRouter);
router.use(albumListsRouter);
router.use(annotationRouter);
router.use(playlistsRouter);

export default router;
