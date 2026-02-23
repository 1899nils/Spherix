import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ArtistDetail as ArtistDetailType, ApiResponse, AlbumWithRelations } from '@musicserver/shared';
import { Mic2, Disc3 } from 'lucide-react';

function DiscographyCard({ album }: { album: AlbumWithRelations }) {
  return (
    <Link
      to={`/albums/${album.id}`}
      className="group flex flex-col rounded-lg bg-muted/30 p-3 hover:bg-muted/60 transition-colors"
    >
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
      <p className="font-medium text-sm truncate">{album.title}</p>
      <p className="text-xs text-muted-foreground">
        {album.year ?? 'Unbekannt'} &middot; {album.trackCount} Tracks
      </p>
    </Link>
  );
}

export function ArtistDetail() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['artist', id],
    queryFn: () => api.get<ApiResponse<ArtistDetailType>>(`/artists/${id}`),
    enabled: !!id,
  });

  const artist = data?.data;

  if (isLoading) {
    return <div className="text-muted-foreground p-8">Lade Künstler...</div>;
  }

  if (!artist) {
    return <div className="text-muted-foreground p-8">Künstler nicht gefunden</div>;
  }

  const albums = artist.albums ?? [];

  return (
    <div className="space-y-8">
      {/* Artist Header */}
      <div className="flex gap-6 items-end">
        {/* Image */}
        <div className="h-48 w-48 rounded-full overflow-hidden bg-muted shrink-0 shadow-lg">
          {artist.imageUrl ? (
            <img
              src={artist.imageUrl}
              alt={artist.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
              <Mic2 className="h-16 w-16" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-2 min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Künstler</p>
          <h1 className="text-4xl font-bold truncate">{artist.name}</h1>
          <p className="text-sm text-muted-foreground">
            {artist.albumCount} {artist.albumCount === 1 ? 'Album' : 'Alben'} &middot; {artist.trackCount} Tracks
          </p>
        </div>
      </div>

      {/* Biography */}
      {artist.biography && (
        <section>
          <h2 className="text-lg font-semibold mb-2">Biografie</h2>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {artist.biography}
          </p>
        </section>
      )}

      {/* Discography */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Diskografie</h2>
        {albums.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Alben vorhanden</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {albums.map((album) => (
              <DiscographyCard key={album.id} album={album} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
