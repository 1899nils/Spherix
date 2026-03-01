import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { useVideoPlayerStore } from '@/stores/videoPlayerStore';
import { Button } from '@/components/ui/button';
import { formatRuntime } from '@/lib/utils';
import { Play, ArrowLeft, Film, Check } from 'lucide-react';
import type { Movie } from '@musicserver/shared';

interface MovieDetailResponse {
  data: Movie;
}

export function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setActiveVideo } = useVideoPlayerStore();
  const [showPlayer, setShowPlayer] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['movie', id],
    queryFn: () => api.get<MovieDetailResponse>(`/video/movies/${id}`),
    enabled: !!id,
  });

  const progressMutation = useMutation({
    mutationFn: (position: number) =>
      api.post(`/video/movies/${id}/progress`, { position }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['movie', id] }),
  });

  const movie = data?.data;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-64 w-full rounded-xl bg-white/5" />
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

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 text-muted-foreground hover:text-white"
        onClick={() => navigate('/video/movies')}
      >
        <ArrowLeft className="h-4 w-4" />
        Alle Filme
      </Button>

      {showPlayer ? (
        /* ── Theater mode ─────────────────────────────────────── */
        <VideoPlayer
          src={`/api/video/movies/${movie.id}/stream`}
          title={movie.title}
          posterUrl={movie.posterPath}
          savedPosition={movie.watchProgress ?? 0}
          onClose={handleClose}
          onProgress={handleProgress}
        />
      ) : (
        /* ── Detail view ──────────────────────────────────────── */
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Poster */}
          <div className="shrink-0 w-48 lg:w-56">
            <div className="aspect-[2/3] rounded-xl overflow-hidden bg-white/5 shadow-xl border border-white/10">
              {movie.posterPath ? (
                <img src={movie.posterPath} alt={movie.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                  <Film className="h-16 w-16" />
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-col gap-4 min-w-0">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">Film</p>
              <h1 className="text-3xl font-bold">{movie.title}</h1>
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {movie.year && <span>{movie.year}</span>}
              {movie.runtime && (
                <>
                  <span className="text-white/20">·</span>
                  <span>{formatRuntime(movie.runtime)}</span>
                </>
              )}
              {movie.codec && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="uppercase text-xs font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/70">
                    {movie.codec}
                  </span>
                </>
              )}
              {movie.resolution && (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/70">
                  {movie.resolution}
                </span>
              )}
              {movie.watched && (
                <span className="flex items-center gap-1 text-green-400 text-xs font-medium">
                  <Check className="h-3.5 w-3.5" />
                  Gesehen
                </span>
              )}
            </div>

            {/* Genres */}
            {movie.genres && movie.genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {movie.genres.map((g) => (
                  <span
                    key={g.id}
                    className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/70"
                  >
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {/* Overview */}
            {movie.overview && (
              <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                {movie.overview}
              </p>
            )}

            {/* Play button */}
            <div className="flex items-center gap-3 mt-2">
              <Button
                size="lg"
                className="gap-2 bg-section-accent hover:bg-section-accent/90 text-white shadow-lg"
                onClick={handlePlay}
              >
                <Play className="h-5 w-5 fill-current" />
                {movie.watchProgress && movie.watchProgress > 60 ? 'Weiterschauen' : 'Abspielen'}
              </Button>
              {movie.watchProgress != null && movie.watchProgress > 60 && movie.runtime && (
                <span className="text-xs text-muted-foreground">
                  {formatRuntime(Math.floor(movie.watchProgress / 60))} gesehen
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
