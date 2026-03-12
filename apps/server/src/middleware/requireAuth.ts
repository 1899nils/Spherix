import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware that requires the current session user to be authenticated.
 * Returns 401 if no active session exists.
 * Attaches userId to the request for downstream use.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = (req.session as unknown as Record<string, unknown>)?.userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  (req as unknown as Record<string, unknown>).userId = userId;
  next();
}
