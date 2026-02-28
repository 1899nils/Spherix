import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PodcastSearchModal } from '@/components/PodcastSearchModal';
import type { Podcast } from '@musicserver/shared';
import { Plus, Headphones } from 'lucide-react';

function PodcastCard({ podcast }: { podcast: Podcast }) {
  return (
    <Link
      to={`/podcasts/${podcast.id}`}
      className="group flex flex-col rounded-lg bg-muted/30 p-3 hover:bg-muted/60 transition-colors"
    >
      <div className="aspect-square rounded-md overflow-hidden bg-muted mb-3">
        {podcast.imageUrl ? (
          <img
            src={podcast.imageUrl}
            alt={podcast.title}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-4xl">
            🎙️
          </div>
        )}
      </div>
      <p className="font-medium text-sm truncate">{podcast.title}</p>
      <p className="text-xs text-muted-foreground truncate">{podcast.author ?? 'Unbekannt'}</p>
      <p className="text-xs text-muted-foreground/60 mt-0.5">
        {podcast.episodeCount} {podcast.episodeCount === 1 ? 'Episode' : 'Episoden'}
      </p>
    </Link>
  );
}

export function Podcasts() {
  const [searchOpen, setSearchOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['podcasts'],
    queryFn: () => api.get<{ data: Podcast[] }>('/podcasts'),
  });

  const podcasts = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Podcasts</h1>
          <p className="text-muted-foreground mt-1">
            {podcasts.length > 0 ? `${podcasts.length} abonniert` : 'Noch keine Abonnements'}
          </p>
        </div>
        <Button onClick={() => setSearchOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Podcast hinzufügen
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Lade Podcasts...</div>
      ) : podcasts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-4">
          <Headphones className="h-14 w-14 opacity-30" />
          <p className="text-lg font-medium">Noch keine Podcasts abonniert</p>
          <p className="text-sm opacity-70">Suche über iTunes und abonniere deinen ersten Podcast</p>
          <Button onClick={() => setSearchOpen(true)} className="mt-2">
            <Plus className="h-4 w-4 mr-2" />
            Podcast suchen
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {podcasts.map((p) => (
            <PodcastCard key={p.id} podcast={p} />
          ))}
        </div>
      )}

      {searchOpen && <PodcastSearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
