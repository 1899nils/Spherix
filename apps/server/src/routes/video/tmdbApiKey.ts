import type { Request } from 'express';
import { prisma } from '../../config/database.js';
import { getUserId } from '../../utils/getUserId.js';

/** Resolve the acting user's configured TMDb API key, if any. */
export async function getTmdbApiKeyForRequest(req: Request): Promise<string | null> {
  const userId = await getUserId(req);
  if (!userId) return null;
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { tmdbApiKey: true },
  });
  return settings?.tmdbApiKey ?? null;
}
