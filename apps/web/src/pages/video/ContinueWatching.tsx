import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MediaCard } from '@/components/ui/MediaCard';
import { MonitorPlay, Film, Tv } from 'lucide-react';
import { formatRuntime } from '@/lib/utils';
import type { Movie } from '@musicserver/shared';

interface ContinueResponse {
  data: {
    movies: Movie[];
    episodes: Array<{
      id: string;
      title: string;
      episodeNumber: number;
      seasonNumber: number;
      runtime: number | null;
      watchProgress: number;
      season: {
        series: { id: string; title: string; posterPath: string | null };
      };
    }>;
  };
}

export function ContinueWatching() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['video-continue'],
    queryFn: () => api.get<ContinueResponse>('/video/continue'),
  });

  const movies = data?.data?.movies ?? [];
  const episodes = data?.data?.episodes ?? [];
  const hasContent = movies.length > 0 || episodes.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <MonitorPlay className="h-6 w-6 text-section-accent" />
        <h1 className="text-2xl font-bold">Weiterschauen</h1>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2 animate-pulse">
              <div className="aspect-[2/3] rounded-lg bg-white/5" />
              <div className="h-3 bg-white/5 rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && !hasContent && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <MonitorPlay className="h-12 w-12 opacity-30" />
          <p>Nichts zum Weiterschauen</p>
          <p className="text-xs opacity-60">Fang einen Film oder eine Serie an!</p>
        </div>
      )}

      {!isLoading && movies.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-muted-foreground">Filme</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {movies.map((movie) => (
              <MediaCard
                key={movie.id}
                title={movie.title}
                year={movie.year}
                imageUrl={movie.posterPath}
                progress={
                  movie.runtime && movie.watchProgress
                    ? movie.watchProgress / (movie.runtime * 60)
                    : undefined
                }
                subtitle={movie.runtime ? formatRuntime(movie.runtime) : undefined}
                aspect="poster"
                fallbackIcon={<Film className="h-12 w-12" />}
                onClick={() => navigate(`/video/movies/${movie.id}`)}
              />
            ))}
          </div>
        </section>
      )}

      {!isLoading && episodes.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-muted-foreground">Serien</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {episodes.map((ep) => (
              <MediaCard
                key={ep.id}
                title={ep.season.series.title}
                subtitle={`S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} · ${ep.title}`}
                imageUrl={ep.season.series.posterPath}
                progress={
                  ep.runtime && ep.watchProgress
                    ? ep.watchProgress / (ep.runtime * 60)
                    : undefined
                }
                aspect="poster"
                fallbackIcon={<Tv className="h-12 w-12" />}
                onClick={() => navigate(`/video/series/${ep.season.series.id}`)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
