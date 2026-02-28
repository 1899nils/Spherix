import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { ArtistWithRelations, PaginatedResponse } from '@musicserver/shared';
import { Mic2 } from 'lucide-react';

function ArtistCard({ artist }: { artist: ArtistWithRelations }) {
  return (
    <Link
      to={`/music/artists/${artist.id}`}
      className="group flex flex-col items-center rounded-lg bg-muted/30 p-4 hover:bg-muted/60 transition-colors"
    >
      {/* Avatar */}
      <div className="h-32 w-32 rounded-full overflow-hidden bg-muted mb-3">
        {artist.imageUrl ? (
          <img
            src={artist.imageUrl}
            alt={artist.name}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            <Mic2 className="h-10 w-10" />
          </div>
        )}
      </div>

      {/* Info */}
      <p className="font-medium text-sm text-center truncate w-full">{artist.name}</p>
      <p className="text-xs text-muted-foreground">
        {artist.albumCount} {artist.albumCount === 1 ? 'Album' : 'Alben'}
      </p>
    </Link>
  );
}

export function Artists() {
  const { data, isLoading } = useQuery({
    queryKey: ['artists'],
    queryFn: () =>
      api.get<PaginatedResponse<ArtistWithRelations>>('/artists?pageSize=100'),
  });

  const artists = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Künstler</h1>
        <p className="text-muted-foreground mt-1">
          {artists.length > 0 ? `${artists.length} Künstler` : 'Alle Künstler'}
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Lade Künstler...</div>
      ) : artists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Mic2 className="h-12 w-12 mb-4" />
          <p>Noch keine Künstler vorhanden</p>
          <p className="text-sm mt-1">Scanne eine Bibliothek in den Einstellungen</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {artists.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
          ))}
        </div>
      )}
    </div>
  );
}
