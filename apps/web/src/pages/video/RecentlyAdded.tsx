import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MediaCard } from '@/components/ui/MediaCard';
import { Clock, Film, Tv } from 'lucide-react';

interface RecentItem {
  id: string;
  title: string;
  year: number | null;
  posterPath: string | null;
  type: 'movie' | 'series';
  addedAt: string;
}

interface RecentResponse {
  data: RecentItem[];
}

export function VideoRecentlyAdded() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['video-recent'],
    queryFn: () => api.get<RecentResponse>('/video/recent?limit=40'),
  });

  const items = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Clock className="h-6 w-6 text-section-accent" />
        <h1 className="text-2xl font-bold">Zuletzt hinzugefügt</h1>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="space-y-2 animate-pulse">
              <div className="aspect-[2/3] rounded-lg bg-white/5" />
              <div className="h-3 bg-white/5 rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Clock className="h-12 w-12 opacity-30" />
          <p>Noch nichts hinzugefügt</p>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {items.map((item) => (
            <MediaCard
              key={item.id}
              title={item.title}
              year={item.year}
              imageUrl={item.posterPath}
              aspect="poster"
              badge={item.type === 'movie' ? 'Film' : 'Serie'}
              fallbackIcon={item.type === 'movie' ? <Film className="h-12 w-12" /> : <Tv className="h-12 w-12" />}
              onClick={() =>
                navigate(item.type === 'movie' ? `/video/movies/${item.id}` : `/video/series/${item.id}`)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
