/**
 * MDBList service
 *
 * Free tier: 1 000 requests/day.
 * Get a free API key at https://mdblist.com/api/
 *
 * A single call by IMDB ID returns IMDb, Rotten Tomatoes, and Metacritic scores.
 */

const MDBLIST_BASE = 'https://mdblist.com/api';

export interface MdblistRatings {
  /** IMDb score (0–10) */
  imdbRating: number | null;
  /** Rotten Tomatoes Tomatometer / critic score (0–100) */
  rottenTomatoesScore: number | null;
  /** Rotten Tomatoes Audience / Popcornmeter score (0–100) */
  rottenTomatoesAudienceScore: number | null;
  /** Metacritic score (0–100) */
  metacriticScore: number | null;
}

interface MdblistRatingEntry {
  source: string;
  value: number | null;
  score?: number | null;
  votes?: number | null;
}

interface MdblistResponse {
  title?: string;
  year?: number;
  imdbid?: string;
  type?: string;
  ratings?: MdblistRatingEntry[];
  response?: boolean;
  error?: string;
}

/**
 * Fetch IMDb, Rotten Tomatoes, and Metacritic ratings from MDBList.
 * Returns all-null on any error so callers can treat this as best-effort.
 */
export async function fetchMdblistRatings(
  imdbId: string,
  apiKey: string,
): Promise<MdblistRatings> {
  const empty: MdblistRatings = {
    imdbRating: null,
    rottenTomatoesScore: null,
    rottenTomatoesAudienceScore: null,
    metacriticScore: null,
  };

  if (!apiKey || !imdbId) return empty;

  try {
    const url = `${MDBLIST_BASE}/?i=${encodeURIComponent(imdbId)}&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return empty;

    const data = (await res.json()) as MdblistResponse;
    if (data.response === false || !data.ratings) return empty;

    const find = (source: string) =>
      data.ratings!.find((r) => r.source === source) ?? null;

    const imdbEntry            = find('imdb');
    const rtEntry              = find('tomatoes');
    const rtAudienceEntry      = find('tomatoesaudience');
    const metacriticEntry      = find('metacritic');

    const imdbRating                    = imdbEntry?.value ?? null;
    const rottenTomatoesScore           = rtEntry?.value != null ? Math.round(rtEntry.value) : null;
    const rottenTomatoesAudienceScore   = rtAudienceEntry?.value != null ? Math.round(rtAudienceEntry.value) : null;
    const metacriticScore               = metacriticEntry?.value != null ? Math.round(metacriticEntry.value) : null;

    return { imdbRating, rottenTomatoesScore, rottenTomatoesAudienceScore, metacriticScore };
  } catch {
    return empty;
  }
}

/** Validate an MDBList API key by fetching a known title (The Dark Knight). */
export async function validateMdblistApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey) return false;
  try {
    const url = `${MDBLIST_BASE}/?i=tt0468569&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return false;
    const data = (await res.json()) as MdblistResponse;
    return data.response !== false && !!data.title;
  } catch {
    return false;
  }
}
