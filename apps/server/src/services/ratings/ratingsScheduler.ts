/**
 * Ratings Scheduler
 *
 * Runs once on startup, then every night at midnight.
 * For each run it processes movies and series that need ratings, respecting a
 * daily MDBList quota of 950 requests.
 *
 * Priority order:
 *   1. Never-fetched items (ratingsUpdatedAt IS NULL)
 *   2. Items scheduled for retry (ratingsNextRetry <= now)
 *   3. Items not refreshed in 30 days (ratingsUpdatedAt < 30 days ago)
 *
 * On fetch failure the item is scheduled for the next day via ratingsNextRetry.
 */

import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { fetchMdblistRatings } from '../metadata/mdblist.service.js';
import { fetchTraktRatings } from '../metadata/trakt.service.js';

const DAILY_LIMIT    = 950;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Quota helpers ─────────────────────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getUsedToday(): Promise<number> {
  const row = await prisma.ratingsDailyQuota.findUnique({ where: { date: todayString() } });
  return row?.usedToday ?? 0;
}

async function incrementQuota(): Promise<void> {
  const date = todayString();
  await prisma.ratingsDailyQuota.upsert({
    where:  { date },
    update: { usedToday: { increment: 1 } },
    create: { date, usedToday: 1 },
  });
}

// ─── Config helpers ────────────────────────────────────────────────────────────

async function getAdminSettings(): Promise<{ mdblistApiKey: string | null; traktClientId: string | null }> {
  const settings = await prisma.userSettings.findFirst({
    where: { user: { isAdmin: true } },
    select: { mdblistApiKey: true, traktClientId: true },
  });
  return {
    mdblistApiKey: settings?.mdblistApiKey ?? null,
    traktClientId: settings?.traktClientId ?? null,
  };
}

// ─── Core refresh ──────────────────────────────────────────────────────────────

async function runRatingsRefresh(): Promise<void> {
  logger.info('[RatingsScheduler] Starting daily ratings refresh');

  const { mdblistApiKey, traktClientId } = await getAdminSettings();
  if (!mdblistApiKey) {
    logger.info('[RatingsScheduler] No MDBList API key configured, skipping');
    return;
  }

  const usedToday = await getUsedToday();
  let remaining   = DAILY_LIMIT - usedToday;

  if (remaining <= 0) {
    logger.info('[RatingsScheduler] Daily quota exhausted, skipping');
    return;
  }

  const now          = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);
  const tomorrow     = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const needsUpdate = {
    OR: [
      { ratingsUpdatedAt: null },
      { ratingsNextRetry: { lte: now } },
      { ratingsUpdatedAt: { lt: thirtyDaysAgo } },
    ],
  };

  // ── Movies ──────────────────────────────────────────────────────────────────
  const movies = await prisma.movie.findMany({
    where: { imdbId: { not: null }, tmdbId: { not: null }, ...needsUpdate },
    select: { id: true, imdbId: true },
    take: remaining,
    orderBy: { ratingsUpdatedAt: { sort: 'asc', nulls: 'first' } },
  });

  for (const movie of movies) {
    if (remaining <= 0) break;
    try {
      const mdblist = await fetchMdblistRatings(movie.imdbId!, mdblistApiKey);
      await incrementQuota();
      remaining--;

      const data: Record<string, unknown> = {
        ratingsUpdatedAt: now,
        ratingsNextRetry: null,
      };
      if (mdblist.imdbRating          !== null) data.imdbRating          = mdblist.imdbRating;
      if (mdblist.rottenTomatoesScore !== null) data.rottenTomatoesScore = mdblist.rottenTomatoesScore;
      if (mdblist.metacriticScore     !== null) data.metacriticScore     = mdblist.metacriticScore;

      if (traktClientId) {
        const trakt = await fetchTraktRatings(movie.imdbId!, traktClientId);
        if (trakt.rating !== null) data.traktRating = trakt.rating;
        if (trakt.votes  !== null) data.traktVotes  = trakt.votes;
      }

      await prisma.movie.update({
        where: { id: movie.id },
        data: data as Parameters<typeof prisma.movie.update>[0]['data'],
      });
    } catch (e) {
      logger.warn(`[RatingsScheduler] Failed for movie ${movie.id}: ${String(e)}`);
      await prisma.movie.update({ where: { id: movie.id }, data: { ratingsNextRetry: tomorrow } });
    }
  }

  // ── Series ──────────────────────────────────────────────────────────────────
  if (remaining > 0) {
    const seriesList = await prisma.series.findMany({
      where: { imdbId: { not: null }, tmdbId: { not: null }, ...needsUpdate },
      select: { id: true, imdbId: true },
      take: remaining,
      orderBy: { ratingsUpdatedAt: { sort: 'asc', nulls: 'first' } },
    });

    for (const series of seriesList) {
      if (remaining <= 0) break;
      try {
        const mdblist = await fetchMdblistRatings(series.imdbId!, mdblistApiKey);
        await incrementQuota();
        remaining--;

        const data: Record<string, unknown> = {
          ratingsUpdatedAt: now,
          ratingsNextRetry: null,
        };
        if (mdblist.imdbRating          !== null) data.imdbRating          = mdblist.imdbRating;
        if (mdblist.rottenTomatoesScore !== null) data.rottenTomatoesScore = mdblist.rottenTomatoesScore;
        if (mdblist.metacriticScore     !== null) data.metacriticScore     = mdblist.metacriticScore;

        if (traktClientId) {
          const trakt = await fetchTraktRatings(series.imdbId!, traktClientId);
          if (trakt.rating !== null) data.traktRating = trakt.rating;
          if (trakt.votes  !== null) data.traktVotes  = trakt.votes;
        }

        await prisma.series.update({
          where: { id: series.id },
          data: data as Parameters<typeof prisma.series.update>[0]['data'],
        });
      } catch (e) {
        logger.warn(`[RatingsScheduler] Failed for series ${series.id}: ${String(e)}`);
        await prisma.series.update({ where: { id: series.id }, data: { ratingsNextRetry: tomorrow } });
      }
    }
  }

  logger.info(`[RatingsScheduler] Refresh complete — quota used today: ${DAILY_LIMIT - remaining}/${DAILY_LIMIT}`);
}

// ─── Scheduling ────────────────────────────────────────────────────────────────

function scheduleNextMidnight(): void {
  const now      = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0); // next midnight
  const msUntil  = midnight.getTime() - now.getTime();

  schedulerTimer = setTimeout(() => {
    runRatingsRefresh().catch((e) =>
      logger.error('[RatingsScheduler] Uncaught error', { error: String(e) }),
    );
    scheduleNextMidnight();
  }, msUntil);

  logger.info(`[RatingsScheduler] Next run in ${Math.round(msUntil / 60_000)} min`);
}

export function startRatingsScheduler(): void {
  // Kick off immediately (non-blocking) then schedule nightly
  runRatingsRefresh().catch((e) =>
    logger.error('[RatingsScheduler] Error during startup refresh', { error: String(e) }),
  );
  scheduleNextMidnight();
  logger.info('[RatingsScheduler] Started');
}

export function stopRatingsScheduler(): void {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
    logger.info('[RatingsScheduler] Stopped');
  }
}
