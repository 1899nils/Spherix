import { Router } from 'express';
import { lastfmService } from '../services/lastfm/lastfm.service.js';
import { scrobbleQueue } from '../services/lastfm/scrobble.queue.js';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';

const router: Router = Router();

async function getUserId(req: any) {
  if (req.session?.userId) return req.session.userId;
  const user = await prisma.user.findFirst({ select: { id: true } });
  return user?.id || null;
}

/** Get Last.fm connection status */
router.get('/status', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      res.json({ data: { connected: false } });
      return;
    }

    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { lastfmUsername: true, lastfmSessionKey: true },
    });

    res.json({
      data: {
        connected: !!settings?.lastfmSessionKey,
        username: settings?.lastfmUsername || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/** Get Last.fm Auth URL */
router.get('/auth-url', async (req, res, next) => {
  try {
    const callbackUrl = `${req.protocol}://${req.get('host')}/api/lastfm/callback`;
    const url = lastfmService.getAuthUrl(callbackUrl);
    res.json({ data: { url } });
  } catch (error) {
    next(error);
  }
});

/** Callback for Last.fm Auth */
router.get('/callback', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) throw new Error('Token is required');

    const { sessionKey, username } = await lastfmService.getSession(token as string);
    const userId = await getUserId(req);

    if (!userId) throw new Error('User not found');

    await prisma.userSettings.upsert({
      where: { userId },
      update: {
        lastfmSessionKey: sessionKey,
        lastfmUsername: username,
      },
      create: {
        userId,
        lastfmSessionKey: sessionKey,
        lastfmUsername: username,
      },
    });

    // Redirect back to settings page in frontend
    res.redirect('/settings?lastfm=connected');
  } catch (error) {
    logger.error('Last.fm callback failed', { error: String(error) });
    res.redirect('/settings?lastfm=error');
  }
});

/** Disconnect Last.fm */
router.post('/disconnect', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    if (!userId) throw new Error('User not authenticated');

    await prisma.userSettings.update({
      where: { userId },
      data: {
        lastfmSessionKey: null,
        lastfmUsername: null,
      },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/** Manual trigger for Now Playing (used by frontend) */
router.post('/now-playing', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).end();

    const { artist, track, album, duration } = req.body;
    await scrobbleQueue.add('now-playing', {
      userId,
      track: { artist, track, album, duration },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/** Manual trigger for Scrobble (used by frontend) */
router.post('/scrobble', async (req, res, next) => {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).end();

    const { artist, track, album } = req.body;
    await scrobbleQueue.add('scrobble', {
      userId,
      track: { artist, track, album },
      timestamp: Math.floor(Date.now() / 1000),
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
