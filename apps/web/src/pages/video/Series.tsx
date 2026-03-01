import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MediaCard } from '@/components/ui/MediaCard';
import { Tv } from 'lucide-react';
import type { Series as SeriesType } from '@musicserver/shared';

interface SeriesResponse {
  data: SeriesType[];
  total: number;
}

export function Series() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['series'],
    queryFn: () => api.get<SeriesResponse>('/video/series?pageSize=100'),
  });

  const shows = data?.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Serien</h1>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2 animate-pulse">
              <div className="aspect-[2/3] rounded-lg bg-white/5" />
              <div className="h-3 bg-white/5 rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && shows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Tv className="h-12 w-12 opacity-30" />
          <p>Keine Serien gefunden</p>
          <p className="text-xs opacity-60">Starte einen Scan unter Einstellungen → Bibliothek</p>
        </div>
      )}

      {!isLoading && shows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {shows.map((show) => (
            <MediaCard
              key={show.id}
              title={show.title}
              year={show.year}
              subtitle={
                show._count?.seasons
                  ? `${show._count.seasons} Staffel${show._count.seasons !== 1 ? 'n' : ''}`
                  : undefined
              }
              imageUrl={show.posterPath}
              aspect="poster"
              fallbackIcon={<Tv className="h-12 w-12" />}
              onClick={() => navigate(`/video/series/${show.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
