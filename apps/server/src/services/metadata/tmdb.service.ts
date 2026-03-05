const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

export interface TmdbResult {
  tmdbId: number;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  rating: number;
  genreIds: number[];
  year: number | null;
}

// Module-level genre cache keyed by type
const genreCache = new Map<string, Map<number, string>>();

async function tmdbFetch<T>(path: string, apiKey: string): Promise<T> {
  const url = `${TMDB_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TMDb ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function validateApiKey(apiKey: string): Promise<void> {
  await tmdbFetch<unknown>('/configuration', apiKey);
}

export async function fetchGenreMap(type: 'movie' | 'tv', apiKey: string): Promise<Map<number, string>> {
  const cacheKey = `${type}:${apiKey}`;
  if (genreCache.has(cacheKey)) return genreCache.get(cacheKey)!;

  const data = await tmdbFetch<{ genres: { id: number; name: string }[] }>(
    `/genre/${type}/list`,
    apiKey,
  );
  const map = new Map(data.genres.map((g) => [g.id, g.name]));
  genreCache.set(cacheKey, map);
  return map;
}

function toImageUrl(path: string | null | undefined): string | null {
  return path ? `${IMAGE_BASE}${path}` : null;
}

function extractYear(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const y = parseInt(dateStr.slice(0, 4), 10);
  return isNaN(y) ? null : y;
}

export async function searchMovie(
  title: string,
  year: number | null,
  apiKey: string,
): Promise<TmdbResult | null> {
  const params = new URLSearchParams({ query: title, language: 'de-DE' });
  if (year) params.set('year', String(year));

  const data = await tmdbFetch<{
    results: {
      id: number;
      overview: string;
      poster_path: string | null;
      backdrop_path: string | null;
      vote_average: number;
      genre_ids: number[];
      release_date: string | null;
    }[];
  }>(`/search/movie?${params}`, apiKey);

  const hit = data.results[0];
  if (!hit) return null;

  return {
    tmdbId: hit.id,
    overview: hit.overview ?? '',
    posterPath: toImageUrl(hit.poster_path),
    backdropPath: toImageUrl(hit.backdrop_path),
    rating: hit.vote_average ?? 0,
    genreIds: hit.genre_ids ?? [],
    year: extractYear(hit.release_date),
  };
}

export async function searchSeries(
  title: string,
  year: number | null,
  apiKey: string,
): Promise<TmdbResult | null> {
  const params = new URLSearchParams({ query: title, language: 'de-DE' });
  if (year) params.set('first_air_date_year', String(year));

  const data = await tmdbFetch<{
    results: {
      id: number;
      overview: string;
      poster_path: string | null;
      backdrop_path: string | null;
      vote_average: number;
      genre_ids: number[];
      first_air_date: string | null;
    }[];
  }>(`/search/tv?${params}`, apiKey);

  const hit = data.results[0];
  if (!hit) return null;

  return {
    tmdbId: hit.id,
    overview: hit.overview ?? '',
    posterPath: toImageUrl(hit.poster_path),
    backdropPath: toImageUrl(hit.backdrop_path),
    rating: hit.vote_average ?? 0,
    genreIds: hit.genre_ids ?? [],
    year: extractYear(hit.first_air_date),
  };
}

// ─── Multi-result search for manual matching ─────────────────────────────────

export interface TmdbSearchResult {
  tmdbId: number;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  rating: number;
  genreIds: number[];
  year: number | null;
  mediaType: 'movie' | 'tv';
}

export async function searchMoviesMultiple(
  title: string,
  year: number | null,
  apiKey: string,
  limit: number = 10,
): Promise<TmdbSearchResult[]> {
  const params = new URLSearchParams({ query: title, language: 'de-DE' });
  if (year) params.set('year', String(year));

  const data = await tmdbFetch<{
    results: {
      id: number;
      title: string;
      original_title: string;
      overview: string;
      poster_path: string | null;
      backdrop_path: string | null;
      vote_average: number;
      genre_ids: number[];
      release_date: string | null;
    }[];
  }>(`/search/movie?${params}`, apiKey);

  return data.results.slice(0, limit).map((hit) => ({
    tmdbId: hit.id,
    title: hit.title,
    originalTitle: hit.original_title,
    overview: hit.overview ?? '',
    posterPath: toImageUrl(hit.poster_path),
    backdropPath: toImageUrl(hit.backdrop_path),
    rating: hit.vote_average ?? 0,
    genreIds: hit.genre_ids ?? [],
    year: extractYear(hit.release_date),
    mediaType: 'movie' as const,
  }));
}

export async function searchSeriesMultiple(
  title: string,
  year: number | null,
  apiKey: string,
  limit: number = 10,
): Promise<TmdbSearchResult[]> {
  const params = new URLSearchParams({ query: title, language: 'de-DE' });
  if (year) params.set('first_air_date_year', String(year));

  const data = await tmdbFetch<{
    results: {
      id: number;
      name: string;
      original_name: string;
      overview: string;
      poster_path: string | null;
      backdrop_path: string | null;
      vote_average: number;
      genre_ids: number[];
      first_air_date: string | null;
    }[];
  }>(`/search/tv?${params}`, apiKey);

  return data.results.slice(0, limit).map((hit) => ({
    tmdbId: hit.id,
    title: hit.name,
    originalTitle: hit.original_name,
    overview: hit.overview ?? '',
    posterPath: toImageUrl(hit.poster_path),
    backdropPath: toImageUrl(hit.backdrop_path),
    rating: hit.vote_average ?? 0,
    genreIds: hit.genre_ids ?? [],
    year: extractYear(hit.first_air_date),
    mediaType: 'tv' as const,
  }));
}

/** Fetch detailed info for a specific movie by TMDB ID */
export async function getMovieDetails(
  tmdbId: number,
  apiKey: string,
): Promise<TmdbResult | null> {
  const data = await tmdbFetch<{
    id: number;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    vote_average: number;
    genre_ids: number[];
    release_date: string | null;
  }>(`/movie/${tmdbId}?language=de-DE`, apiKey);

  if (!data) return null;

  return {
    tmdbId: data.id,
    overview: data.overview ?? '',
    posterPath: toImageUrl(data.poster_path),
    backdropPath: toImageUrl(data.backdrop_path),
    rating: data.vote_average ?? 0,
    genreIds: data.genre_ids ?? [],
    year: extractYear(data.release_date),
  };
}

/** Fetch detailed info for a specific series by TMDB ID */
export async function getSeriesDetails(
  tmdbId: number,
  apiKey: string,
): Promise<TmdbResult | null> {
  const data = await tmdbFetch<{
    id: number;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    vote_average: number;
    genre_ids: number[];
    first_air_date: string | null;
  }>(`/tv/${tmdbId}?language=de-DE`, apiKey);

  if (!data) return null;

  return {
    tmdbId: data.id,
    overview: data.overview ?? '',
    posterPath: toImageUrl(data.poster_path),
    backdropPath: toImageUrl(data.backdrop_path),
    rating: data.vote_average ?? 0,
    genreIds: data.genre_ids ?? [],
    year: extractYear(data.first_air_date),
  };
}
