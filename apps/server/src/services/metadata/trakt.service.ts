/**
 * Trakt.tv service
 *
 * Fetches community ratings for movies via the public Trakt API.
 * Only a Client ID (available for free at https://trakt.tv/oauth/applications)
 * is required — no OAuth flow is needed for public read-only data.
 *
 * Endpoint used: GET /movies/{imdb-id}/ratings
 * Response:      { rating: number (0–10), votes: number }
 */

const TRAKT_BASE = 'https://api.trakt.tv';

export interface TraktRatings {
  /** Community score on a 0–10 scale (e.g. 7.3) */
  rating: number | null;
  /** Total vote count */
  votes: number | null;
}

/**
 * Validate a Trakt Client ID by hitting the /movies/trending endpoint.
 * Returns true if the key is accepted (HTTP 200).
 */
export async function validateTraktClientId(clientId: string): Promise<boolean> {
  if (!clientId) return false;
  try {
    const res = await fetch(`${TRAKT_BASE}/movies/trending?limit=1`, {
      headers: buildHeaders(clientId),
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch Trakt community rating for a movie identified by its IMDb ID.
 *
 * Falls back to all-null when clientId is missing, imdbId is unknown,
 * or the request fails — so callers can treat this as best-effort.
 */
export async function fetchTraktRatings(
  imdbId: string,
  clientId: string,
): Promise<TraktRatings> {
  const empty: TraktRatings = { rating: null, votes: null };

  if (!clientId || !imdbId) return empty;

  try {
    const res = await fetch(`${TRAKT_BASE}/movies/${encodeURIComponent(imdbId)}/ratings`, {
      headers: buildHeaders(clientId),
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) return empty;

    const data = (await res.json()) as { rating?: number; votes?: number };

    const rating = typeof data.rating === 'number' && data.rating > 0 ? data.rating : null;
    const votes  = typeof data.votes  === 'number' && data.votes  > 0 ? data.votes  : null;

    return { rating, votes };
  } catch {
    return empty;
  }
}

function buildHeaders(clientId: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': clientId,
  };
}
