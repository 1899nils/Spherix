import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { AlbumWithRelations, PaginatedResponse } from '@musicserver/shared';
import { Disc3 } from 'lucide-react';

function AlbumCard({ album }: { album: AlbumWithRelations }) {
  return (
    <Link
      to={`/albums/${album.id}`}
      className="group flex flex-col rounded-lg bg-muted/30 p-3 hover:bg-muted/60 transition-colors"
    >
      {/* Cover */}
      <div className="aspect-square rounded-md overflow-hidden bg-muted mb-3">
        {album.coverUrl ? (
          <img
            src={album.coverUrl}
            alt={album.title}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            <Disc3 className="h-12 w-12" />
          </div>
        )}
      </div>

      {/* Info */}
      <p className="font-medium text-sm truncate">{album.title}</p>
      <p className="text-xs text-muted-foreground truncate">
        {album.artist.name}
        {album.year && <span> &middot; {album.year}</span>}
      </p>
    </Link>
  );
}

export function Albums() {
  const { data, isLoading } = useQuery({
    queryKey: ['albums'],
    queryFn: () =>
      api.get<PaginatedResponse<AlbumWithRelations>>('/albums?pageSize=100'),
  });

  const albums = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Alben</h1>
        <p className="text-muted-foreground mt-1">
          {albums.length > 0 ? `${albums.length} Alben` : 'Alle Alben'}
        </p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Lade Alben...</div>
      ) : albums.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Disc3 className="h-12 w-12 mb-4" />
          <p>Keine Alben gefunden</p>
          <p className="text-sm mt-1">Scanne eine Bibliothek in den Einstellungen</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      )}
    </div>
  );
}
