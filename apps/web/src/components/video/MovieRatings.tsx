import type { Movie } from '@musicserver/shared';

interface Props {
  movie: Movie;
}

/** Round a 0–10 IMDb score to one decimal */
function fmtImdb(v: number): string {
  return v.toFixed(1);
}

/** Rotten Tomatoes freshness icon */
function rtIcon(score: number): string {
  return score >= 60 ? '🍅' : '🤢';
}

export function MovieRatings({ movie }: Props) {
  const hasTmdb   = movie.rating != null && movie.rating > 0;
  const hasImdb   = movie.imdbRating != null && movie.imdbRating > 0;
  const hasRt     = movie.rottenTomatoesScore != null;
  const hasMeta   = movie.metacriticScore != null;
  const hasTrakt  = movie.traktRating != null && movie.traktRating > 0;

  if (!hasTmdb && !hasImdb && !hasRt && !hasMeta && !hasTrakt) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* IMDb */}
      {hasImdb && (
        <a
          href={movie.imdbId ? `https://www.imdb.com/title/${movie.imdbId}/` : undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#f5c518]/10 border border-[#f5c518]/30 hover:bg-[#f5c518]/20 transition-colors no-underline group"
          title="IMDb Rating"
        >
          {/* IMDb wordmark */}
          <span className="text-[#f5c518] font-black text-xs tracking-tight leading-none">IMDb</span>
          <span className="text-white font-semibold text-sm">{fmtImdb(movie.imdbRating!)}</span>
        </a>
      )}

      {/* TMDB */}
      {hasTmdb && (
        <a
          href={movie.tmdbId ? `https://www.themoviedb.org/movie/${movie.tmdbId}` : undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#01b4e4]/10 border border-[#01b4e4]/30 hover:bg-[#01b4e4]/20 transition-colors no-underline"
          title="TMDB Rating"
        >
          <span className="text-[#01b4e4] font-black text-xs leading-none">TMDB</span>
          <span className="text-white font-semibold text-sm">
            {Math.round(movie.rating! * 10)}%
          </span>
        </a>
      )}

      {/* Rotten Tomatoes */}
      {hasRt && (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10"
          title="Rotten Tomatoes"
        >
          <span className="text-sm leading-none">{rtIcon(movie.rottenTomatoesScore!)}</span>
          <span className="text-white/70 font-bold text-xs leading-none">RT</span>
          <span className="text-white font-semibold text-sm">{movie.rottenTomatoesScore!}%</span>
        </div>
      )}

      {/* Metacritic */}
      {hasMeta && (
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10"
          title="Metacritic"
        >
          <MetacriticBadge score={movie.metacriticScore!} />
        </div>
      )}

      {/* Trakt */}
      {hasTrakt && (
        <a
          href={movie.imdbId ? `https://trakt.tv/search/imdb/${movie.imdbId}` : 'https://trakt.tv'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#ed1c24]/10 border border-[#ed1c24]/30 hover:bg-[#ed1c24]/20 transition-colors no-underline"
          title={movie.traktVotes != null ? `Trakt · ${movie.traktVotes.toLocaleString()} Stimmen` : 'Trakt Rating'}
        >
          <span className="text-[#ed1c24] font-black text-xs leading-none">TRAKT</span>
          <span className="text-white font-semibold text-sm">{movie.traktRating!.toFixed(1)}</span>
        </a>
      )}
    </div>
  );
}

function MetacriticBadge({ score }: { score: number }) {
  const color =
    score >= 61 ? '#6c3' :
    score >= 40 ? '#fc3' :
                  '#f00';

  return (
    <>
      <span
        className="text-xs font-black leading-none px-1 rounded"
        style={{ backgroundColor: color, color: '#000' }}
      >
        {score}
      </span>
      <span className="text-white/70 font-bold text-xs leading-none">MC</span>
    </>
  );
}
