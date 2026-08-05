import type { Request } from 'express';
import { prisma } from '../config/database.js';

/**
 * Resolve the acting user's ID from the session, falling back to the first
 * user in the DB when there's no session.
 *
 * This used to be copy-pasted (with `req: any`) into a dozen route files.
 * `req.session.userId` is properly typed already via the `SessionData`
 * module augmentation in `types/session.d.ts` — no `any`/casting needed.
 */
export async function getUserId(req: Request): Promise<string | null> {
  if (req.session?.userId) return req.session.userId;
  const user = await prisma.user.findFirst({ select: { id: true } });
  return user?.id ?? null;
}
