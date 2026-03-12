import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../config/database.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router: Router = Router();

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get('/me', async (req, res, next) => {
  try {
    const userId = (req.session as unknown as Record<string, unknown>).userId as string | undefined;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, isAdmin: true },
    });
    if (!user) {
      req.session.destroy(() => {});
      res.status(401).json({ error: 'User not found' });
      return;
    }
    res.json({ data: user });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
      return;
    }
    const passwordHash = hashPassword(password);
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username }, { email: username }],
        passwordHash,
      },
      select: { id: true, username: true, email: true, isAdmin: true },
    });
    if (!user) {
      res.status(401).json({ error: 'Ungültige Anmeldedaten' });
      return;
    }
    (req.session as unknown as Record<string, unknown>).userId = user.id;
    res.json({ data: user });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/auth/logout ────────────────────────────────────────────────────

router.post('/logout', (req, res) => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

// ── GET /api/auth/users (admin only) ────────────────────────────────────────

router.get('/users', requireAdmin, async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, email: true, isAdmin: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ data: users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })) });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/auth/users (admin only) ───────────────────────────────────────

router.post('/users', requireAdmin, async (req, res, next) => {
  try {
    const { username, email, password, isAdmin } = req.body as {
      username?: string;
      email?: string;
      password?: string;
      isAdmin?: boolean;
    };
    if (!username || !password) {
      res.status(400).json({ error: 'Benutzername und Passwort erforderlich' });
      return;
    }
    if (password.length < 4) {
      res.status(400).json({ error: 'Passwort muss mindestens 4 Zeichen haben' });
      return;
    }
    const user = await prisma.user.create({
      data: {
        username,
        email: email?.trim() || `${username}@spherix.local`,
        passwordHash: hashPassword(password),
        isAdmin: isAdmin ?? false,
      },
      select: { id: true, username: true, email: true, isAdmin: true, createdAt: true },
    });
    res.status(201).json({ data: { ...user, createdAt: user.createdAt.toISOString() } });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === 'P2002') {
      res.status(409).json({ error: 'Benutzername oder E-Mail bereits vergeben' });
      return;
    }
    next(error);
  }
});

// ── DELETE /api/auth/users/:id (admin only) ──────────────────────────────────

router.delete('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const currentUserId = (req.session as unknown as Record<string, unknown>).userId as string;
    if (req.params.id === currentUserId) {
      res.status(400).json({ error: 'Das eigene Konto kann nicht gelöscht werden' });
      return;
    }
    await prisma.user.delete({ where: { id: String(req.params.id) } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ── PUT /api/auth/users/:id/password ────────────────────────────────────────

router.put('/users/:id/password', async (req, res, next) => {
  try {
    const currentUserId = (req.session as unknown as Record<string, unknown>).userId as string | undefined;
    if (!currentUserId) {
      res.status(401).json({ error: 'Nicht angemeldet' });
      return;
    }
    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { isAdmin: true },
    });
    if (req.params.id !== currentUserId && !currentUser?.isAdmin) {
      res.status(403).json({ error: 'Keine Berechtigung' });
      return;
    }
    const { password } = req.body as { password?: string };
    if (!password || password.length < 4) {
      res.status(400).json({ error: 'Passwort muss mindestens 4 Zeichen haben' });
      return;
    }
    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash: hashPassword(password) },
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
