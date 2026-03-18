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
  RotateCcw, User, ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { Movie, MovieCredits } from '@musicserver/shared';
import { MediaMetadataEditor } from '@/components/MediaMetadataEditor';
import { TmdbSearchModal } from '@/components/video/TmdbSearchModal';
import { MovieRatings } from '@/components/video/MovieRatings';

interface MovieDetailResponse {
  data: Movie;
}

interface CreditsResponse {
  data: MovieCredits;
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

  // ── Derived crew lists ────────────────────────────────────────────────────
  const directors = credits?.crew.filter((c) => c.job === 'Director') ?? [];
  const writers = credits?.crew.filter(
    (c) => ['Screenplay', 'Writer', 'Story'].includes(c.job),
  ) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-[420px] w-full rounded-xl bg-white/5" />
        <div className="h-8 bg-white/5 rounded w-1/3" />
        <div className="h-4 bg-white/5 rounded w-2/3" />
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
    if (!castScrollRef.current) return;
    castScrollRef.current.scrollBy({ left: dir === 'right' ? 300 : -300, behavior: 'smooth' });
  };

  const resumeLabel = movie.watchProgress && movie.watchProgress > 60
    ? 'Weiterschauen'
    : 'Abspielen';

  return (
    <div className="min-h-screen -mx-4 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-6">
      {/* ── Theater mode ───────────────────────────────────────────────────── */}
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
          />
        </div>
      )}

      {showDetailView && (
        <>
          {/* ── Hero / Backdrop ──────────────────────────────────────────── */}
          <div className="relative w-full" style={{ minHeight: 480 }}>
            {/* Backdrop image */}
            {movie.backdropPath ? (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${movie.backdropPath})` }}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
            )}

            {/* Gradient overlays */}
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/30 to-transparent" />

            {/* Content layer */}
            <div className="relative z-10 px-4 sm:px-6 lg:px-8 pt-6 pb-10">
              {/* Back button */}
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-white/60 hover:text-white mb-6"
                onClick={() => navigate('/video/movies')}
              >
                <ArrowLeft className="h-4 w-4" />
                Alle Filme
              </Button>

              <div className="flex gap-8 items-start">
                {/* Left: all info */}
                <div className="flex-1 min-w-0 flex flex-col gap-4">
                  {/* Title */}
                  <h1 className="text-4xl lg:text-5xl font-black text-white leading-tight drop-shadow-lg">
                    {movie.title}
                  </h1>

                  {/* Meta badges row */}
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {movie.year && (
                      <span className="text-white/70 font-medium">{movie.year}</span>
                    )}
                    {(movie.fskRating ?? movie.contentRating) && (
                      <span className="px-1.5 py-0.5 rounded border border-white/30 text-white/70 text-xs font-bold">
                        {movie.fskRating ?? movie.contentRating}
                      </span>
                    )}
                    {movie.runtime && (
                      <span className="text-white/70">{formatRuntime(movie.runtime)}</span>
                    )}
                    {movie.resolution && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs font-bold uppercase">
                        {movie.resolution}
                      </span>
                    )}
                    {movie.codec && (
                      <span className="px-1.5 py-0.5 rounded bg-white/10 text-white/60 text-xs font-bold uppercase">
                        {movie.codec}
                      </span>
                    )}
                    {movie.watched && (
                      <span className="flex items-center gap-1 text-green-400 text-xs font-medium">
                        <Check className="h-3 w-3" /> Gesehen
                      </span>
                    )}
                  </div>

                  {/* Ratings */}
                  <MovieRatings movie={movie} />

                  {/* Tagline */}
                  {movie.tagline && (
                    <p className="text-white/50 italic text-sm">"{movie.tagline}"</p>
                  )}

                  {/* Overview */}
                  {movie.overview ? (
                    <p className="text-white/70 text-sm leading-relaxed max-w-2xl">
                      {movie.overview}
                    </p>
                  ) : !movie.tmdbId && (
                    <div className="flex items-start gap-2 text-amber-400/80 text-sm bg-amber-500/10 rounded-lg p-3 max-w-md">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-400">Keine Metadaten</p>
                        <p className="text-xs mt-0.5 text-amber-400/70">Nicht mit TMDb verknüpft.</p>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-3 mt-2">
                    <Button
                      size="lg"
                      className="gap-2 bg-white text-black hover:bg-white/90 font-bold shadow-xl px-8"
                      onClick={handlePlay}
                    >
                      <Play className="h-5 w-5 fill-current" />
                      {resumeLabel}
                    </Button>

                    <Button
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 bg-white/10 border-white/20 hover:bg-white/20 text-white"
                      onClick={() => setShowEditor(true)}
                      title="Metadaten bearbeiten"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="outline"
                      size="icon"
                      className={`h-11 w-11 border-white/20 text-white ${
                        movie.tmdbId
                          ? 'bg-white/10 hover:bg-white/20'
                          : 'bg-amber-500/20 border-amber-500/40 hover:bg-amber-500/30 text-amber-300'
                      }`}
                      onClick={() => setShowTmdbModal(true)}
                      title={movie.tmdbId ? 'TMDb Verknüpfung bearbeiten' : 'Mit TMDb verknüpfen'}
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>

                    {movie.tmdbId && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 bg-white/10 border-white/20 hover:bg-white/20 text-white"
                        onClick={() => refreshRatingsMutation.mutate()}
                        disabled={refreshRatingsMutation.isPending}
                        title="Bewertungen aktualisieren"
                      >
                        <RotateCcw className={`h-4 w-4 ${refreshRatingsMutation.isPending ? 'animate-spin' : ''}`} />
                      </Button>
                    )}

                    {movie.watchProgress != null && movie.watchProgress > 60 && movie.runtime && (
                      <span className="text-xs text-white/40">
                        {formatRuntime(Math.floor(movie.watchProgress / 60))} gesehen
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: Poster */}
                <div className="hidden md:block shrink-0 w-44 lg:w-52">
                  <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
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
          </div>

          {/* ── Details & Cast ───────────────────────────────────────────── */}
          <div className="px-4 sm:px-6 lg:px-8 pb-12 space-y-10 bg-[#0a0a0a]">
            {/* Metadata grid */}
            {(movie.genres.length > 0 || directors.length > 0 || writers.length > 0 || movie.runtime) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
                {movie.genres.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-white/30 font-semibold mb-1.5">
                      Genres
                    </p>
                    <p className="text-sm text-white/80">
                      {movie.genres.map((g) => g.name).join(', ')}
                    </p>
                  </div>
                )}
                {directors.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-white/30 font-semibold mb-1.5">
                      Regie
                    </p>
                    <p className="text-sm text-white/80">
                      {directors.map((d) => d.name).join(', ')}
                    </p>
                  </div>
                )}
                {writers.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-white/30 font-semibold mb-1.5">
                      Drehbuch
                    </p>
                    <p className="text-sm text-white/80">
                      {writers.map((w) => w.name).join(', ')}
                    </p>
                  </div>
                )}
                {movie.runtime && (
                  <div>
                    <p className="text-xs uppercase tracking-widest text-white/30 font-semibold mb-1.5">
                      Laufzeit
                    </p>
                    <p className="text-sm text-white/80">{formatRuntime(movie.runtime)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Cast & Crew */}
            {credits && credits.cast.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-white">Besetzung</h2>
                  <div className="flex gap-1">
                    <button
                      onClick={() => scrollCast('left')}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => scrollCast('right')}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div
                  ref={castScrollRef}
                  className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide"
                  style={{ scrollSnapType: 'x mandatory' }}
                >
                  {credits.cast.map((member) => (
                    <div
                      key={member.id}
                      className="shrink-0 w-28 text-center"
                      style={{ scrollSnapAlign: 'start' }}
                    >
                      <div className="w-20 h-20 mx-auto rounded-full overflow-hidden bg-white/5 ring-1 ring-white/10 mb-2">
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
                      <p className="text-xs text-white font-medium leading-tight line-clamp-2">
                        {member.name}
                      </p>
                      <p className="text-xs text-white/40 leading-tight mt-0.5 line-clamp-2">
                        {member.character}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {movie && (
        <MediaMetadataEditor
          isOpen={showEditor}
          onClose={() => setShowEditor(false)}
          type="movie"
          id={movie.id}
          initialData={{
            title:      movie.title,
            year:       movie.year,
            overview:   movie.overview,
            runtime:    movie.runtime,
            codec:      movie.codec,
            resolution: movie.resolution,
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
