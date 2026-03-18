import { Router } from 'express';
import { prisma } from '../config/database.js';
import { validateTraktClientId } from '../services/metadata/trakt.service.js';

const router: Router = Router();

async function getUserId(req: any): Promise<string | null> {
  if (req.session?.userId) return req.session.userId;
  const user = await prisma.user.findFirst({ select: { id: true } });
  return user?.id ?? null;
}

/** GET /api/trakt/status — return current config */
router.get('/status', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) {
      res.json({ data: { configured: false, clientId: null } });
      return;
    }

    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { traktClientId: true },
    });

    res.json({
      data: {
        configured: !!settings?.traktClientId,
        clientId: settings?.traktClientId ?? null,
      },
    });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/trakt/config — save Client ID */
router.post('/config', async (req, res) => {
  try {
    const userId = await getUserId(req);
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }

    const { clientId } = req.body as { clientId?: string };
    if (typeof clientId !== 'string') {
      res.status(400).json({ error: 'clientId (string) is required' });
      return;
    }

    await prisma.userSettings.upsert({
      where: { userId },
      update: { traktClientId: clientId || null },
      create: { userId, traktClientId: clientId || null },
    });

    res.json({ data: { configured: !!clientId } });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/** POST /api/trakt/test-config — validate without saving */
router.post('/test-config', async (_req, res) => {
  try {
    const { clientId } = _req.body as { clientId?: string };
    if (!clientId) { res.status(400).json({ error: 'clientId is required' }); return; }

    const valid = await validateTraktClientId(clientId);
    if (valid) {
      res.json({ data: { valid: true } });
    } else {
      res.status(400).json({ error: 'Ungültiger Trakt Client ID' });
    }
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
