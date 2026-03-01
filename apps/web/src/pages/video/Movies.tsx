import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MediaCard } from '@/components/ui/MediaCard';
import { Film } from 'lucide-react';
import type { Movie } from '@musicserver/shared';

interface MoviesResponse {
  data: Movie[];
  total: number;
  totalPages: number;
}

export function Movies() {
  const navigate = useNavigate();
  const [sort, setSort] = useState('title');

  const { data, isLoading } = useQuery({
    queryKey: ['movies', sort],
    queryFn: () => api.get<MoviesResponse>(`/video/movies?sort=${sort}&pageSize=100`),
  });

  const movies = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Filme</h1>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-section-accent"
        >
          <option value="title">Titel A–Z</option>
          <option value="newest">Zuletzt hinzugefügt</option>
          <option value="year">Erscheinungsjahr</option>
        </select>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="space-y-2 animate-pulse">
              <div className="aspect-[2/3] rounded-lg bg-white/5" />
              <div className="h-3 bg-white/5 rounded w-3/4" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && movies.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Film className="h-12 w-12 opacity-30" />
          <p>Keine Filme gefunden</p>
          <p className="text-xs opacity-60">Starte einen Scan unter Einstellungen → Bibliothek</p>
        </div>
      )}

      {!isLoading && movies.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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
              badge={movie.watched ? '✓' : undefined}
              aspect="poster"
              fallbackIcon={<Film className="h-12 w-12" />}
              onClick={() => navigate(`/video/movies/${movie.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
