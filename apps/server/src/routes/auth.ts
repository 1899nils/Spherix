import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

const router: Router = Router();

const BCRYPT_ROUNDS = 12;

const MIN_PASSWORD_LENGTH = 8;

/** Hash a plain-text password with bcrypt. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a plain-text password against a stored hash.
 * Supports legacy SHA-256 hashes (hex, 64 chars) for seamless migration:
 * on a successful legacy match the hash is automatically upgraded to bcrypt.
 */
export async function verifyPassword(
  plain: string,
  stored: string,
  userId?: string,
): Promise<boolean> {
  // Bcrypt hash
  if (stored.startsWith('$2')) {
    return bcrypt.compare(plain, stored);
  }

  // Legacy SHA-256 hash (64-char hex) — migrate on successful login
  const { createHash } = await import('node:crypto');
  const legacyHash = createHash('sha256').update(plain).digest('hex');
  if (legacyHash !== stored) return false;

  // Auto-upgrade: replace legacy hash with bcrypt in background
  if (userId) {
    const newHash = await hashPassword(plain);
    prisma.user
      .update({ where: { id: userId }, data: { passwordHash: newHash } })
      .catch(() => {});
  }

  return true;
}

// ── Validation schemas ────────────────────────────────────────────────────────

const loginSchema = z.object({
  username: z.string().min(1, 'Benutzername erforderlich'),
  password: z.string().min(1, 'Passwort erforderlich'),
});

const createUserSchema = z.object({
  username: z.string().min(1, 'Benutzername erforderlich').max(64),
  email: z.string().email('Ungültige E-Mail-Adresse').optional(),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben`),
  isAdmin: z.boolean().optional(),
});

const patchUserSchema = z.object({
  username: z.string().min(1).max(64).optional(),
  email: z.string().email('Ungültige E-Mail-Adresse').optional(),
  isAdmin: z.boolean().optional(),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben`)
    .optional(),
});

const changePasswordSchema = z.object({
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben`),
});

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
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Ungültige Eingabe' });
      return;
    }
    const { username, password } = parsed.data;

    const user = await prisma.user.findFirst({
      where: { OR: [{ username }, { email: username }] },
      select: { id: true, username: true, email: true, isAdmin: true, passwordHash: true },
    });

    if (!user || !(await verifyPassword(password, user.passwordHash, user.id))) {
      res.status(401).json({ error: 'Ungültige Anmeldedaten' });
      return;
    }

    (req.session as unknown as Record<string, unknown>).userId = user.id;
    const { passwordHash: _ignored, ...safeUser } = user;
    res.json({ data: safeUser });
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
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Ungültige Eingabe' });
      return;
    }
    const { username, email, password, isAdmin } = parsed.data;

    const user = await prisma.user.create({
      data: {
        username,
        email: email?.trim() || `${username}@spherix.local`,
        passwordHash: await hashPassword(password),
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

// ── PATCH /api/auth/users/:id (admin only) ──────────────────────────────────

router.patch('/users/:id', requireAdmin, async (req, res, next) => {
  try {
    const parsed = patchUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Ungültige Eingabe' });
      return;
    }
    const { username, email, isAdmin, password } = parsed.data;

    const data: Record<string, unknown> = {};
    if (username !== undefined) data.username = username.trim();
    if (email !== undefined) data.email = email.trim() || undefined;
    if (isAdmin !== undefined) data.isAdmin = isAdmin;
    if (password !== undefined) data.passwordHash = await hashPassword(password);

    const updated = await prisma.user.update({
      where: { id: String(req.params.id) },
      data,
      select: { id: true, username: true, email: true, isAdmin: true, createdAt: true },
    });
    res.json({ data: { ...updated, createdAt: updated.createdAt.toISOString() } });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === 'P2002') {
      res.status(409).json({ error: 'Benutzername oder E-Mail bereits vergeben' });
      return;
    }
    next(error);
  }
});

// ── PUT /api/auth/users/:id/password ────────────────────────────────────────

router.put('/users/:id/password', async (req, res, next) => {
  try {
    const currentUserId = (req.session as unknown as Record<string, unknown>).userId as
      | string
      | undefined;
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

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Ungültige Eingabe' });
      return;
    }

    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export default router;
