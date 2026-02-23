import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';

/**
 * Middleware that requires the current session user to be an admin.
 * Returns 401 if not authenticated, 403 if not admin.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = (req.session as unknown as Record<string, unknown>).userId as
    | string
    | undefined;

  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user || !user.isAdmin) {
      res.status(403).json({ error: 'Admin privileges required' });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}
