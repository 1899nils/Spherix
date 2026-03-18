import type { Movie } from '@musicserver/shared';

type RatableMedia = Pick<
  Movie,
  | 'tmdbId' | 'imdbId' | 'rating'
  | 'imdbRating'
  | 'rottenTomatoesScore' | 'rottenTomatoesAudienceScore'
  | 'metacriticScore'
  | 'traktRating' | 'traktVotes'
>;

interface Props {
  movie: RatableMedia;
}

// ─── Uniform badge wrapper ────────────────────────────────────────────────────

function Badge({
  icon,
  value,
  label,
  href,
  title,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  href?: string;
  title?: string;
}) {
  const cls =
    'flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-zinc-800/90 border border-white/10 ' +
    'hover:border-white/25 hover:bg-zinc-700/80 transition-all no-underline min-w-0';

  const inner = (
    <>
      <div className="h-8 w-8 shrink-0 flex items-center justify-center">{icon}</div>
      <div className="flex flex-col">
        <span className="text-white font-bold text-sm leading-tight">{value}</span>
        <span className="text-white/50 text-[11px] leading-tight">{label}</span>
      </div>
    </>
  );

  if (href)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} title={title}>
        {inner}
      </a>
    );

  return (
    <div className={cls} title={title}>
      {inner}
    </div>
  );
}

// ─── Service icons (inline SVG) ───────────────────────────────────────────────

function ImdbIcon() {
  return (
    <svg viewBox="0 0 80 36" className="h-5 w-auto">
      <rect width="80" height="36" rx="5" fill="#F5C518" />
      <text
        x="6" y="27"
        fill="#000000"
        fontSize="24"
        fontWeight="900"
        fontFamily="'Arial Black', Arial, sans-serif"
      >
        IMDb
      </text>
    </svg>
  );
}

function TmdbIcon() {
  return (
    <svg viewBox="0 0 40 40" className="h-8 w-8">
      <circle cx="20" cy="20" r="20" fill="#032541" />
      <circle cx="20" cy="20" r="14.5" fill="none" stroke="#01b4e4" strokeWidth="3" />
      <circle cx="20" cy="20" r="7" fill="#01b4e4" />
    </svg>
  );
}

function TraktIcon() {
  return (
    <svg viewBox="0 0 40 40" className="h-8 w-8">
      <circle cx="20" cy="20" r="20" fill="#ED1C24" />
      <circle cx="20" cy="20" r="13" fill="none" stroke="white" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="4.5" fill="white" />
    </svg>
  );
}

/** Red fresh tomato */
function RtFreshIcon() {
  return (
    <svg viewBox="0 0 50 50" className="h-8 w-8">
      {/* stem */}
      <rect x="23.5" y="5" width="3" height="10" rx="1.5" fill="#2D8B00" />
      {/* leaves */}
      <ellipse cx="17" cy="15" rx="9" ry="5" fill="#3AAA1A" transform="rotate(-35,17,15)" />
      <ellipse cx="33" cy="15" rx="9" ry="5" fill="#3AAA1A" transform="rotate(35,33,15)" />
      {/* body */}
      <circle cx="25" cy="30" r="17" fill="#FA320A" />
      {/* highlight */}
      <ellipse cx="18" cy="23" rx="4.5" ry="3.5" fill="rgba(255,255,255,0.22)" transform="rotate(-20,18,23)" />
    </svg>
  );
}

/** Green splat (rotten) */
function RtRottenIcon() {
  return (
    <svg viewBox="0 0 50 50" className="h-8 w-8">
      <circle cx="25" cy="28" r="15" fill="#7C9900" />
      <ellipse cx="14" cy="17" rx="8" ry="12" fill="#4A9A1A" transform="rotate(-40,14,17)" />
      <ellipse cx="36" cy="17" rx="8" ry="12" fill="#4A9A1A" transform="rotate(40,36,17)" />
      <circle cx="25" cy="28" r="5" fill="#5A7200" />
    </svg>
  );
}

/** Yellow popcorn bucket (audience liked) */
function PopcornFreshIcon() {
  return (
    <svg viewBox="0 0 50 54" className="h-8 w-8">
      {/* bucket */}
      <path d="M13 28 L18 50 L32 50 L37 28 Z" fill="#CC2200" />
      <path d="M21 28 L20 50 L23 50 L24 28 Z" fill="#AA1A00" />
      <path d="M29 28 L28 50 L31 50 L32 28 Z" fill="#AA1A00" />
      {/* popcorn pieces */}
      <circle cx="16" cy="22" r="7.5" fill="white" />
      <circle cx="25" cy="17" r="9" fill="#FFF8E7" />
      <circle cx="34" cy="22" r="7.5" fill="white" />
      <circle cx="20" cy="11" r="6.5" fill="#FFF8E7" />
      <circle cx="30" cy="11" r="6.5" fill="white" />
    </svg>
  );
}

/** Grey popcorn bucket (audience didn't like) */
function PopcornRottenIcon() {
  return (
    <svg viewBox="0 0 50 54" className="h-8 w-8">
      <path d="M13 28 L18 50 L32 50 L37 28 Z" fill="#555" />
      <path d="M21 28 L20 50 L23 50 L24 28 Z" fill="#444" />
      <path d="M29 28 L28 50 L31 50 L32 28 Z" fill="#444" />
      <circle cx="16" cy="22" r="7.5" fill="#999" />
      <circle cx="25" cy="17" r="9" fill="#888" />
      <circle cx="34" cy="22" r="7.5" fill="#999" />
      <circle cx="20" cy="11" r="6.5" fill="#888" />
      <circle cx="30" cy="11" r="6.5" fill="#999" />
    </svg>
  );
}

function MetacriticIcon({ score }: { score: number }) {
  const bg =
    score >= 61 ? '#66CC33' :
    score >= 40 ? '#FFCC33' :
                  '#FF4444';
  return (
    <svg viewBox="0 0 40 40" className="h-8 w-8">
      <rect width="40" height="40" rx="6" fill={bg} />
      <text
        x="20" y="30"
        textAnchor="middle"
        fill="#000"
        fontSize="26"
        fontWeight="900"
        fontFamily="'Arial Black', Arial, sans-serif"
      >
        M
      </text>
    </svg>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function MovieRatings({ movie }: Props) {
  const hasTmdb      = movie.rating != null && movie.rating > 0;
  const hasImdb      = movie.imdbRating != null && movie.imdbRating > 0;
  const hasRt        = movie.rottenTomatoesScore != null;
  const hasRtAud     = movie.rottenTomatoesAudienceScore != null;
  const hasMeta      = movie.metacriticScore != null;
  const hasTrakt     = movie.traktRating != null && movie.traktRating > 0;

  if (!hasTmdb && !hasImdb && !hasRt && !hasRtAud && !hasMeta && !hasTrakt) return null;

  const rtScore    = movie.rottenTomatoesScore!;
  const rtAudScore = movie.rottenTomatoesAudienceScore!;

  return (
    <div className="flex flex-wrap items-center gap-2">

      {/* IMDb */}
      {hasImdb && (
        <Badge
          icon={<ImdbIcon />}
          value={movie.imdbRating!.toFixed(1)}
          label="IMDb"
          href={movie.imdbId ? `https://www.imdb.com/title/${movie.imdbId}/` : undefined}
          title="IMDb Rating"
        />
      )}

      {/* TMDB */}
      {hasTmdb && (
        <Badge
          icon={<TmdbIcon />}
          value={`${Math.round(movie.rating! * 10)}%`}
          label="TMDB"
          href={movie.tmdbId ? `https://www.themoviedb.org/movie/${movie.tmdbId}` : undefined}
          title="TMDB Rating"
        />
      )}

      {/* Trakt */}
      {hasTrakt && (
        <Badge
          icon={<TraktIcon />}
          value={movie.traktRating!.toFixed(1)}
          label="Trakt"
          href={movie.imdbId ? `https://trakt.tv/search/imdb/${movie.imdbId}` : 'https://trakt.tv'}
          title={movie.traktVotes != null ? `Trakt · ${movie.traktVotes.toLocaleString()} Stimmen` : 'Trakt'}
        />
      )}

      {/* RT Tomatometer */}
      {hasRt && (
        <Badge
          icon={rtScore >= 60 ? <RtFreshIcon /> : <RtRottenIcon />}
          value={`${rtScore}%`}
          label="Tomatometer"
          title={`Rotten Tomatoes Tomatometer · ${rtScore >= 60 ? 'Fresh' : 'Rotten'}`}
        />
      )}

      {/* RT Audience / Popcornmeter */}
      {hasRtAud && (
        <Badge
          icon={rtAudScore >= 60 ? <PopcornFreshIcon /> : <PopcornRottenIcon />}
          value={`${rtAudScore}%`}
          label="Popcornmeter"
          title={`RT Audience Score · ${rtAudScore >= 60 ? 'Liked' : 'Disliked'}`}
        />
      )}

      {/* Metacritic */}
      {hasMeta && (
        <Badge
          icon={<MetacriticIcon score={movie.metacriticScore!} />}
          value={`${movie.metacriticScore!}`}
          label="Metacritic"
          title="Metacritic Score"
        />
      )}

    </div>
  );
}
