import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';

const BASE_URL = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'MusicServer/1.0 (contact@example.com)';
const CACHE_TTL = 60 * 60 * 24; // 24 hours in seconds
const MIN_REQUEST_INTERVAL_MS = 1100; // ~1 req/sec with safety margin

/**
 * Simple token-bucket rate limiter: ensures at most 1 request per second
 * across the entire process.
 */
let lastRequestTime = 0;

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    const wait = MIN_REQUEST_INTERVAL_MS - elapsed;
    await new Promise((r) => setTimeout(r, wait));
  }
  lastRequestTime = Date.now();
}

/**
 * Build a deterministic cache key from the URL + params.
 */
function cacheKey(path: string, params: Record<string, string>): string {
  const sorted = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return `mb:${path}:${sorted}`;
}

/**
 * Fetches JSON from the MusicBrainz API with:
 *  - Mandatory User-Agent header
 *  - Rate limiting (max 1 req/sec)
 *  - Redis response caching (24h TTL)
 */
export async function mbFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const key = cacheKey(path, params);

  // Check cache first
  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch {
    // Cache miss or Redis unavailable — continue to fetch
  }

  // Build URL
  const url = new URL(`${BASE_URL}/${path}`);
  url.searchParams.set('fmt', 'json');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  await waitForRateLimit();

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `MusicBrainz API error: ${res.status} ${res.statusText} — ${body}`,
    );
  }

  const data = (await res.json()) as T;

  // Cache the response
  try {
    await redis.set(key, JSON.stringify(data), 'EX', CACHE_TTL);
  } catch (err) {
    logger.warn('Failed to cache MusicBrainz response', { key, error: String(err) });
  }

  return data;
}

/**
 * Fetches from the Cover Art Archive (separate API, same rate limit).
 */
export async function caaFetch<T>(path: string): Promise<T> {
  const key = `caa:${path}`;

  try {
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch {
    // continue
  }

  const url = `https://coverartarchive.org/${path}`;

  await waitForRateLimit();

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Cover Art Archive error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as T;

  try {
    await redis.set(key, JSON.stringify(data), 'EX', CACHE_TTL);
  } catch (err) {
    logger.warn('Failed to cache CAA response', { error: String(err) });
  }

  return data;
}
