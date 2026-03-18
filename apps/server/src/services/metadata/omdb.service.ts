/**
 * OMDb (Open Movie Database) service
 *
 * Free tier: up to 1 000 requests/day (no key required, but very limited).
 * With a free API key from https://www.omdbapi.com/apikey.aspx:
 *   - 1 000 requests/day → free
 *
 * Set OMDB_API_KEY in your environment to enable IMDb, Rotten Tomatoes, and
 * Metacritic ratings. Without a key, these ratings are simply left null.
 */

const OMDB_BASE = 'https://www.omdbapi.com';

export interface OmdbRatings {
  /** IMDb score on a 0–10 scale (e.g. 7.5) */
  imdbRating: number | null;
  /** Rotten Tomatoes critic score as integer 0–100 (e.g. 75) */
  rottenTomatoesScore: number | null;
  /** Metacritic critic score as integer 0–100 (e.g. 67) */
  metacriticScore: number | null;
}

/**
 * Fetch IMDb, Rotten Tomatoes, and Metacritic ratings from OMDb.
 *
 * Returns all-null if the API key is missing, the IMDb ID is unknown,
 * or the OMDb request fails — so callers can treat this as best-effort.
 */
export async function fetchOmdbRatings(
  imdbId: string,
  apiKey: string,
): Promise<OmdbRatings> {
  const empty: OmdbRatings = {
    imdbRating: null,
    rottenTomatoesScore: null,
    metacriticScore: null,
  };

  if (!apiKey || !imdbId) return empty;

  try {
    const url = `${OMDB_BASE}/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return empty;

    const data = (await res.json()) as {
      Response: string;
      imdbRating?: string;
      Metascore?: string;
      Ratings?: { Source: string; Value: string }[];
    };

    if (data.Response !== 'True') return empty;

    const imdbRating = parseFloat(data.imdbRating ?? '') || null;

    const metacriticScore =
      data.Metascore && data.Metascore !== 'N/A'
        ? parseInt(data.Metascore, 10) || null
        : null;

    const rtEntry = data.Ratings?.find((r) => r.Source === 'Rotten Tomatoes');
    const rottenTomatoesScore = rtEntry
      ? parseInt(rtEntry.Value, 10) || null   // "75%" → 75
      : null;

    return { imdbRating, rottenTomatoesScore, metacriticScore };
  } catch {
    return empty;
  }
}
