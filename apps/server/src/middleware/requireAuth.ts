import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database.js';

/**
 * Middleware that requires the current session user to be authenticated.
 * Falls back to first user in DB if no session (consistent with other routes).
 * Returns 401 if no user can be determined.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const sessionUserId = (req.session as unknown as Record<string, unknown>)?.userId as string | undefined;
  
  // If session exists, use it
  if (sessionUserId) {
    // Attach userId to request for downstream use
    (req as unknown as Record<string, unknown>).userId = sessionUserId;
    next();
    return;
  }

  // Fallback to first user (consistent with other routes like settings, tmdb, etc.)
  try {
    const user = await prisma.user.findFirst({ select: { id: true } });
    if (user) {
      (req as unknown as Record<string, unknown>).userId = user.id;
      next();
      return;
    }
  } catch (error) {
    next(error);
    return;
  }

  res.status(401).json({ error: 'Authentication required' });
}
