const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

/** Normalize a German FSK certification string to "FSK X" format or null. */
function normalizeFsk(cert: string | null | undefined): string | null {
  if (!cert) return null;
  const c = cert.trim();
  if (!c) return null;
  if (c.toLowerCase().startsWith('fsk')) {
    const n = parseInt(c.replace(/\D/g, ''));
    return isNaN(n) ? null : `FSK ${n}`;
  }
  const n = parseInt(c);
  if (!isNaN(n) && [0, 6, 12, 16, 18].includes(n)) return `FSK ${n}`;
  return null;
}

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

// ─── Enriched movie details (ratings, cast, content rating) ──────────────────

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  profilePath: string | null;
  order: number;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profilePath: string | null;
}

export interface TmdbMovieEnriched extends TmdbResult {
  imdbId: string | null;
  tagline: string | null;
  contentRating: string | null;   // US certification: "PG-13", "R", "G", etc.
  fskRating: string | null;       // German FSK certification: "FSK 12", "FSK 16", etc.
  productionCompanies: string[];
  cast: TmdbCastMember[];
  crew: TmdbCrewMember[];
}

/**
 * Fetch enriched movie details in a single TMDB request using append_to_response.
 * Returns cast, crew, content rating (US certification), tagline, imdbId, and
 * production companies – everything needed for the movie detail page.
 */
export async function getMovieEnrichedDetails(
  tmdbId: number,
  apiKey: string,
): Promise<TmdbMovieEnriched | null> {
  const data = await tmdbFetch<{
    id: number;
    imdb_id: string | null;
    title: string;
    overview: string;
    tagline: string | null;
    poster_path: string | null;
    backdrop_path: string | null;
    vote_average: number;
    genres: { id: number; name: string }[];
    release_date: string | null;
    production_companies: { id: number; name: string }[];
    release_dates: {
      results: {
        iso_3166_1: string;
        release_dates: { certification: string; type: number }[];
      }[];
    };
    credits: {
      cast: {
        id: number;
        name: string;
        character: string;
        profile_path: string | null;
        order: number;
      }[];
      crew: {
        id: number;
        name: string;
        job: string;
        department: string;
        profile_path: string | null;
      }[];
    };
  }>(
    `/movie/${tmdbId}?append_to_response=release_dates,credits&language=de-DE`,
    apiKey,
  );

  if (!data) return null;

  // Extract US content rating (theatrical release = type 3)
  const usRelease = data.release_dates?.results?.find((r) => r.iso_3166_1 === 'US');
  const certification =
    usRelease?.release_dates
      ?.filter((rd) => rd.certification)
      ?.sort((a, b) => a.type - b.type)
      ?.[0]?.certification ?? null;

  // Extract German FSK rating
  const deRelease = data.release_dates?.results?.find((r) => r.iso_3166_1 === 'DE');
  const deRawCert = deRelease?.release_dates
    ?.filter((rd) => rd.certification)
    ?.sort((a, b) => a.type - b.type)
    ?.[0]?.certification ?? null;
  const fskRating = normalizeFsk(deRawCert);

  const cast: TmdbCastMember[] = (data.credits?.cast ?? [])
    .slice(0, 20)
    .map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character,
      profilePath: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
      order: c.order,
    }));

  const crew: TmdbCrewMember[] = (data.credits?.crew ?? [])
    .filter((c) => ['Director', 'Screenplay', 'Writer', 'Story', 'Producer'].includes(c.job))
    .map((c) => ({
      id: c.id,
      name: c.name,
      job: c.job,
      department: c.department,
      profilePath: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
    }));

  return {
    tmdbId: data.id,
    imdbId: data.imdb_id ?? null,
    overview: data.overview ?? '',
    tagline: data.tagline ?? null,
    posterPath: toImageUrl(data.poster_path),
    backdropPath: toImageUrl(data.backdrop_path),
    rating: data.vote_average ?? 0,
    genreIds: (data.genres ?? []).map((g) => g.id),
    year: extractYear(data.release_date),
    contentRating: certification,
    fskRating,
    productionCompanies: (data.production_companies ?? []).map((c) => c.name),
    cast,
    crew,
  };
}

/**
 * Fetch only cast & crew for a movie (lighter call than enriched details).
 * Used when the movie is already in the DB and we just need credits for the UI.
 */
export async function getMovieCredits(
  tmdbId: number,
  apiKey: string,
): Promise<{ cast: TmdbCastMember[]; crew: TmdbCrewMember[] }> {
  const data = await tmdbFetch<{
    cast: {
      id: number;
      name: string;
      character: string;
      profile_path: string | null;
      order: number;
    }[];
    crew: {
      id: number;
      name: string;
      job: string;
      department: string;
      profile_path: string | null;
    }[];
  }>(`/movie/${tmdbId}/credits?language=de-DE`, apiKey);

  return {
    cast: (data.cast ?? []).slice(0, 20).map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character,
      profilePath: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
      order: c.order,
    })),
    crew: (data.crew ?? [])
      .filter((c) => ['Director', 'Screenplay', 'Writer', 'Story', 'Producer'].includes(c.job))
      .map((c) => ({
        id: c.id,
        name: c.name,
        job: c.job,
        department: c.department,
        profilePath: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
      })),
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

/** Fetch external IDs and German FSK rating for a TV series. */
export async function getSeriesExternalData(
  tmdbId: number,
  apiKey: string,
): Promise<{ imdbId: string | null; fskRating: string | null }> {
  const [externalIds, contentRatings] = await Promise.all([
    tmdbFetch<{ imdb_id?: string | null }>(`/tv/${tmdbId}/external_ids`, apiKey),
    tmdbFetch<{ results: { iso_3166_1: string; rating: string }[] }>(`/tv/${tmdbId}/content_ratings`, apiKey),
  ]);

  const deRating = contentRatings?.results?.find((r) => r.iso_3166_1 === 'DE')?.rating ?? null;

  return {
    imdbId: externalIds?.imdb_id ?? null,
    fskRating: normalizeFsk(deRating),
  };
}

/** @deprecated Use getSeriesExternalData instead */
export async function getSeriesImdbId(tmdbId: number, apiKey: string): Promise<string | null> {
  const { imdbId } = await getSeriesExternalData(tmdbId, apiKey);
  return imdbId;
}
