import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { useVideoPlayerStore } from '@/stores/videoPlayerStore';
import { Button } from '@/components/ui/button';
import { formatRuntime } from '@/lib/utils';
import {
  Play, ArrowLeft, Film, Check, Pencil, Link2, AlertCircle,
  RotateCcw, User, Heart, ChevronLeft, ChevronRight, Star,
} from 'lucide-react';
import type { Movie, MovieCredits } from '@musicserver/shared';
import { MediaMetadataEditor } from '@/components/MediaMetadataEditor';
import { TmdbSearchModal } from '@/components/video/TmdbSearchModal';
import { MovieRatings } from '@/components/video/MovieRatings';

interface MovieDetailResponse { data: Movie }
interface CreditsResponse { data: MovieCredits }

// Square action button with label below
function ActionButton({
  icon,
  label,
  onClick,
  active,
  warn,
  disabled,
  large,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  warn?: boolean;
  disabled?: boolean;
  large?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1.5 group ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className={`flex items-center justify-center rounded-xl transition-all
        ${large ? 'w-16 h-16' : 'w-14 h-14'}
        ${active ? 'bg-white/25 ring-1 ring-white/40' : warn ? 'bg-amber-500/20 ring-1 ring-amber-500/40' : 'bg-white/10 hover:bg-white/20'}
      `}>
        <span className={warn ? 'text-amber-300' : 'text-white'}>{icon}</span>
      </div>
      <span className={`text-[11px] text-center leading-tight max-w-[60px] truncate ${warn ? 'text-amber-300/80' : 'text-white/50 group-hover:text-white/70'}`}>
        {label}
      </span>
    </button>
  );
}

export function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setActiveVideo, isMinimized } = useVideoPlayerStore();
  const [showPlayer, setShowPlayer] = useState(false);
  const showDetailView = !showPlayer || isMinimized;
  const [showEditor, setShowEditor] = useState(false);
  const [showTmdbModal, setShowTmdbModal] = useState(false);
  const castScrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['movie', id],
    queryFn: () => api.get<MovieDetailResponse>(`/video/movies/${id}`),
    enabled: !!id,
  });

  const { data: creditsData } = useQuery({
    queryKey: ['movie-credits', id],
    queryFn: () => api.get<CreditsResponse>(`/video/movies/${id}/credits`),
    enabled: !!id && !!data?.data?.tmdbId,
  });

  const progressMutation = useMutation({
    mutationFn: (position: number) =>
      api.post(`/video/movies/${id}/progress`, { position }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['movie', id] }),
  });

  const refreshRatingsMutation = useMutation({
    mutationFn: () => api.post(`/video/movies/${id}/refresh-ratings`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['movie', id] }),
  });

  const movie = data?.data;
  const credits = creditsData?.data;

  const directors = credits?.crew.filter((c) => c.job === 'Director') ?? [];
  const writers = credits?.crew.filter(
    (c) => ['Screenplay', 'Writer', 'Story'].includes(c.job),
  ) ?? [];

  if (isLoading) {
    return (
      <div className="animate-pulse -mx-4 sm:-mx-6 lg:-mx-8 -mt-4">
        <div className="h-[560px] w-full bg-white/5" />
        <div className="px-8 py-6 space-y-4">
          <div className="h-12 bg-white/5 rounded w-1/2" />
          <div className="h-4 bg-white/5 rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
        <Film className="h-12 w-12 opacity-30" />
        <p>Film nicht gefunden</p>
        <Button variant="ghost" onClick={() => navigate('/video/movies')}>Zurück</Button>
      </div>
    );
  }

  const handlePlay = () => {
    setActiveVideo({
      id: movie.id,
      title: movie.title,
      type: 'movie',
      streamUrl: `/api/video/movies/${movie.id}/stream`,
      posterUrl: movie.posterPath,
      runtime: movie.runtime,
    });
    setShowPlayer(true);
  };

  const handleClose = () => {
    setShowPlayer(false);
    setActiveVideo(null);
  };

  const handleProgress = (position: number) => {
    progressMutation.mutate(position);
  };

  const scrollCast = (dir: 'left' | 'right') => {
    castScrollRef.current?.scrollBy({ left: dir === 'right' ? 360 : -360, behavior: 'smooth' });
  };

  const resumeLabel = movie.watchProgress && movie.watchProgress > 60 ? 'Weiterschauen' : 'Abspielen';
  const hasProgress = movie.watchProgress != null && movie.watchProgress > 60 && movie.runtime;
  const progressPercent = hasProgress
    ? Math.min(100, (movie.watchProgress! / (movie.runtime! * 60)) * 100)
    : 0;

  return (
    <div className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-6 bg-[#0a0a0a]">
      {/* ── Theater mode ─────────────────────────────────────────────────────── */}
      {showPlayer && !isMinimized && (
        <div className="fixed inset-0 z-50 bg-black">
          <VideoPlayer
            src={`/api/video/movies/${movie.id}/stream`}
            title={movie.title}
            posterUrl={movie.posterPath}
            savedPosition={movie.watchProgress ?? 0}
            duration={movie.runtime ? movie.runtime * 60 : null}
            onClose={handleClose}
            onProgress={handleProgress}
            onComplete={() => {
              if (movie.runtime) handleProgress(movie.runtime * 60 * 0.95);
            }}
            mediaType="movie"
            mediaId={movie.id}
          />
        </div>
      )}

      {showDetailView && (
        <>
          {/* ── Hero ─────────────────────────────────────────────────────────── */}
          <div className="relative w-full" style={{ minHeight: 560 }}>
            {/* Backdrop */}
            {movie.backdropPath ? (
              <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${movie.backdropPath})` }}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950" />
            )}

            {/* Gradient layers */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/70 to-black/20" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-black/40" />

            {/* Content */}
            <div className="relative z-10 flex h-full px-6 sm:px-10 pt-5 pb-12" style={{ minHeight: 560 }}>
              {/* Left column */}
              <div className="flex flex-col justify-between flex-1 min-w-0 pr-6">
                {/* Back button */}
                <button
                  onClick={() => navigate('/video/movies')}
                  className="flex items-center gap-1.5 text-white/50 hover:text-white text-sm transition-colors w-fit"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Alle Filme
                </button>

                {/* Main info */}
                <div className="flex flex-col gap-4 mt-auto">
                  {/* Logo or Title */}
                  {movie.logoPath ? (
                    <img
                      src={movie.logoPath}
                      alt={movie.title}
                      className="max-h-28 max-w-xs object-contain object-left drop-shadow-2xl"
                    />
                  ) : (
                    <h1 className="text-4xl lg:text-5xl font-black text-white leading-tight drop-shadow-2xl max-w-xl">
                      {movie.title}
                    </h1>
                  )}

                  {/* Meta badges */}
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {movie.year && (
                      <span className="text-white/70 font-semibold">{movie.year}</span>
                    )}
                    {(movie.fskRating ?? movie.contentRating) && (
                      <span className="px-2 py-0.5 rounded border border-white/30 text-white/70 text-xs font-bold tracking-wide">
                        {movie.fskRating ?? movie.contentRating}
                      </span>
                    )}
                    {movie.imdbRating != null && movie.imdbRating > 0 && (
                      <span className="flex items-center gap-1 text-yellow-400 font-bold">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        {movie.imdbRating.toFixed(1)}
                      </span>
                    )}
                    {movie.runtime && (
                      <span className="text-white/60">{formatRuntime(movie.runtime)}</span>
                    )}
                    {movie.resolution && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/25 border border-blue-400/40 text-blue-300 text-xs font-bold uppercase tracking-wide">
                        {movie.resolution}
                      </span>
                    )}
                    {movie.codec && (
                      <span className="px-1.5 py-0.5 rounded bg-white/10 text-white/50 text-xs font-bold uppercase tracking-wide">
                        {movie.codec}
                      </span>
                    )}
                    {movie.watched && (
                      <span className="flex items-center gap-1 text-green-400 text-xs font-semibold">
                        <Check className="h-3 w-3" /> Gesehen
                      </span>
                    )}
                  </div>

                  {/* Ratings row */}
                  <div className="overflow-x-auto scrollbar-hide">
                    <MovieRatings movie={movie} />
                  </div>

                  {/* Tagline */}
                  {movie.tagline && (
                    <p className="text-white/45 italic text-sm">"{movie.tagline}"</p>
                  )}

                  {/* Overview */}
                  {movie.overview ? (
                    <p className="text-white/65 text-sm leading-relaxed max-w-2xl line-clamp-3">
                      {movie.overview}
                    </p>
                  ) : !movie.tmdbId && (
                    <div className="flex items-start gap-2 text-amber-400/80 text-sm bg-amber-500/10 rounded-lg p-3 max-w-md border border-amber-500/20">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-400">Keine Metadaten</p>
                        <p className="text-xs mt-0.5 text-amber-400/60">Nicht mit TMDb verknüpft.</p>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-end gap-4 mt-1">
                    {/* Play — primary */}
                    <button
                      onClick={handlePlay}
                      className="flex flex-col items-center gap-1.5 group"
                    >
                      <div className="relative flex items-center justify-center w-16 h-16 rounded-xl bg-white hover:bg-white/90 transition-all shadow-lg overflow-hidden">
                        <Play className="h-7 w-7 text-black fill-current ml-0.5" />
                        {progressPercent > 0 && (
                          <div
                            className="absolute bottom-0 left-0 h-1 bg-red-500"
                            style={{ width: `${progressPercent}%` }}
                          />
                        )}
                      </div>
                      <span className="text-[11px] text-white/70 group-hover:text-white transition-colors">{resumeLabel}</span>
                    </button>

                    <ActionButton
                      icon={<Check className="h-5 w-5" />}
                      label={movie.watched ? 'Gesehen' : 'Ungesehen'}
                      active={movie.watched}
                    />

                    <ActionButton
                      icon={<Heart className="h-5 w-5" />}
                      label="Favorit"
                    />

                    <ActionButton
                      icon={<Pencil className="h-5 w-5" />}
                      label="Bearbeiten"
                      onClick={() => setShowEditor(true)}
                    />

                    <ActionButton
                      icon={<Link2 className="h-5 w-5" />}
                      label="TMDb"
                      warn={!movie.tmdbId}
                      onClick={() => setShowTmdbModal(true)}
                    />

                    {movie.tmdbId && (
                      <ActionButton
                        icon={<RotateCcw className={`h-5 w-5 ${refreshRatingsMutation.isPending ? 'animate-spin' : ''}`} />}
                        label="Ratings"
                        onClick={() => refreshRatingsMutation.mutate()}
                        disabled={refreshRatingsMutation.isPending}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Poster */}
              <div className="hidden md:flex items-end shrink-0 w-48 lg:w-56 pb-2">
                <div className="w-full aspect-[2/3] rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/15">
                  {movie.posterPath ? (
                    <img
                      src={movie.posterPath}
                      alt={movie.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-white/5 flex items-center justify-center text-white/20">
                      <Film className="h-16 w-16" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Below hero ───────────────────────────────────────────────────── */}
          <div className="px-6 sm:px-10 pb-16 space-y-10">

            {/* Metadata bar — single horizontal row */}
            {(movie.genres.length > 0 || directors.length > 0 || writers.length > 0 || movie.studio || movie.runtime) && (
              <div className="flex flex-wrap divide-x divide-white/10 rounded-xl bg-white/[0.04] border border-white/[0.08] overflow-hidden">
                {movie.genres.length > 0 && (
                  <div className="flex flex-col gap-1 px-5 py-4 flex-1 min-w-[120px]">
                    <span className="text-[10px] uppercase tracking-widest font-semibold text-white/30">Genres</span>
                    <span className="text-sm text-white/80">{movie.genres.map((g) => g.name).join(', ')}</span>
                  </div>
                )}
                {directors.length > 0 && (
                  <div className="flex flex-col gap-1 px-5 py-4 flex-1 min-w-[120px]">
                    <span className="text-[10px] uppercase tracking-widest font-semibold text-white/30">Regie</span>
                    <span className="text-sm text-white/80">{directors.map((d) => d.name).join(', ')}</span>
                  </div>
                )}
                {writers.length > 0 && (
                  <div className="flex flex-col gap-1 px-5 py-4 flex-1 min-w-[160px]">
                    <span className="text-[10px] uppercase tracking-widest font-semibold text-white/30">Drehbuch</span>
                    <span className="text-sm text-white/80">{writers.map((w) => w.name).join(', ')}</span>
                  </div>
                )}
                {movie.studio && (
                  <div className="flex flex-col gap-1 px-5 py-4 flex-1 min-w-[120px]">
                    <span className="text-[10px] uppercase tracking-widest font-semibold text-white/30">Studio</span>
                    <span className="text-sm text-white/80">{movie.studio}</span>
                  </div>
                )}
                {movie.runtime && (
                  <div className="flex flex-col gap-1 px-5 py-4 min-w-[100px]">
                    <span className="text-[10px] uppercase tracking-widest font-semibold text-white/30">Laufzeit</span>
                    <span className="text-sm text-white/80">{formatRuntime(movie.runtime)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Cast & Crew */}
            {credits && credits.cast.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl font-bold text-white">Besetzung &amp; Crew</h2>
                  <div className="flex gap-1">
                    <button
                      onClick={() => scrollCast('left')}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => scrollCast('right')}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div
                  ref={castScrollRef}
                  className="flex gap-5 overflow-x-auto pb-3 scrollbar-hide"
                  style={{ scrollSnapType: 'x mandatory' }}
                >
                  {credits.cast.map((member) => (
                    <div
                      key={member.id}
                      className="shrink-0 w-24 text-center"
                      style={{ scrollSnapAlign: 'start' }}
                    >
                      <div className="w-20 h-20 mx-auto rounded-full overflow-hidden bg-white/5 ring-1 ring-white/10 mb-2.5">
                        {member.profilePath ? (
                          <img
                            src={member.profilePath}
                            alt={member.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/20">
                            <User className="h-8 w-8" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-white font-medium leading-tight line-clamp-2">{member.name}</p>
                      <p className="text-xs text-white/40 leading-tight mt-0.5 line-clamp-2">{member.character}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Full overview (below hero) */}
            {movie.overview && (
              <section>
                <h2 className="text-xl font-bold text-white mb-3">Handlung</h2>
                <p className="text-white/65 text-sm leading-relaxed max-w-3xl">{movie.overview}</p>
              </section>
            )}
          </div>
        </>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}
      {movie && (
        <MediaMetadataEditor
          isOpen={showEditor}
          onClose={() => setShowEditor(false)}
          type="movie"
          id={movie.id}
          initialData={{
            title:         movie.title,
            sortTitle:     movie.sortTitle,
            originalTitle: movie.originalTitle,
            year:          movie.year,
            releaseDate:   movie.releaseDate,
            runtime:       movie.runtime,
            overview:      movie.overview,
            tagline:       movie.tagline,
            studio:        movie.studio,
            network:       movie.network,
            fskRating:     movie.fskRating,
            contentRating: movie.contentRating,
            posterPath:    movie.posterPath,
            backdropPath:  movie.backdropPath,
            logoPath:      movie.logoPath,
            tmdbId:        movie.tmdbId,
            imdbId:        movie.imdbId,
            codec:         movie.codec,
            resolution:    movie.resolution,
          }}
        />
      )}

      {movie && (
        <TmdbSearchModal
          isOpen={showTmdbModal}
          onClose={() => setShowTmdbModal(false)}
          type="movie"
          item={movie}
        />
      )}
    </div>
  );
}
