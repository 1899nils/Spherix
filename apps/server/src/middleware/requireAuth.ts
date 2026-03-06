import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware that requires the current session user to be authenticated.
 * Returns 401 if not authenticated.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = (req.session as unknown as Record<string, unknown>).userId as
    | string
    | undefined;

  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  next();
}
