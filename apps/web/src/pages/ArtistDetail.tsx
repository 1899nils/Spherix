import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/utils';
import { usePlayerStore } from '@/stores/playerStore';
import { MetadataEditModal } from '@/components/MetadataEditModal';
import type { ArtistDetail as ArtistDetailType, ApiResponse, AlbumWithRelations, TrackWithRelations } from '@musicserver/shared';
import { Play, Pause, Disc3, Mic2, Pencil, Download, Music } from 'lucide-react';

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
  const [editOpen, setEditOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['artist', id],
    queryFn: () => api.get<ApiResponse<ArtistDetailType>>(`/artists/${id}`),
    enabled: !!id,
  });

  const fetchMetaMutation = useMutation({
    mutationFn: () => api.post(`/artists/${id}/fetch-metadata`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artist', id] });
      queryClient.invalidateQueries({ queryKey: ['artists'] });
    },
  });

  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayerStore();

  const artist = data?.data;

  if (isLoading) {
    return <div className="text-muted-foreground p-8">Lade Künstler...</div>;
  }

  if (!artist) {
    return <div className="text-muted-foreground p-8">Künstler nicht gefunden</div>;
  }

  const albums = artist.albums ?? [];
  const tracks = artist.tracks ?? [];

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    } else if (albums.length > 0) {
      // fallback: open first album
    }
  };

  const handlePlayTrack = (track: TrackWithRelations) => {
    playTrack(track, tracks);
  };

  const isArtistPlaying =
    currentTrack && tracks.some((t) => t.id === currentTrack.id) && isPlaying;

  return (
    <div className="space-y-0 -mx-6 -mt-6">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <div className="relative overflow-hidden min-h-[320px] flex items-end">
        {/* Blurred background */}
        {artist.imageUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center scale-110"
            style={{ backgroundImage: `url(${artist.imageUrl})`, filter: 'blur(40px) brightness(0.35)' }}
          />
        )}
        {/* Fallback gradient if no image */}
        {!artist.imageUrl && (
          <div className="absolute inset-0 bg-gradient-to-b from-muted to-background" />
        )}
        {/* Bottom gradient for smooth fade into content */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

        {/* Content */}
        <div className="relative z-10 flex items-end gap-6 px-6 pb-6 w-full">
          {/* Artist image */}
          <div className="h-44 w-44 rounded-full overflow-hidden bg-muted shrink-0 shadow-2xl border border-white/10">
            {artist.imageUrl ? (
              <img
                src={artist.imageUrl}
                alt={artist.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                <Mic2 className="h-20 w-20" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="space-y-2 min-w-0 pb-1">
            <p className="text-xs uppercase tracking-widest text-white/70 font-semibold">Künstler</p>
            <h1 className="text-5xl font-black truncate text-white drop-shadow-lg leading-tight">
              {artist.name}
            </h1>
            <p className="text-sm text-white/60">
              {artist.albumCount} {artist.albumCount === 1 ? 'Album' : 'Alben'} &middot; {artist.trackCount} Tracks
            </p>
          </div>
        </div>
      </div>

      {/* ── Action Bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-5">
        {tracks.length > 0 && (
          <Button
            size="lg"
            className="rounded-full px-8"
            onClick={isArtistPlaying ? togglePlay : handlePlayAll}
          >
            {isArtistPlaying ? (
              <Pause className="h-5 w-5 mr-2" />
            ) : (
              <Play className="h-5 w-5 mr-2" />
            )}
            {isArtistPlaying ? 'Pause' : 'Abspielen'}
          </Button>
        )}

        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4 mr-1.5" />
          Bearbeiten
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchMetaMutation.mutate()}
          disabled={fetchMetaMutation.isPending}
        >
          <Download className="h-4 w-4 mr-1.5" />
          {fetchMetaMutation.isPending ? 'Lade...' : 'Metadaten abrufen'}
        </Button>

        {fetchMetaMutation.isError && (
          <span className="text-xs text-red-500">{(fetchMetaMutation.error as Error).message}</span>
        )}
        {fetchMetaMutation.isSuccess && (
          <span className="text-xs text-green-500">Metadaten aktualisiert</span>
        )}
      </div>

      <div className="px-6 space-y-10 pb-8">
        {/* ── Beliebte Titel ─────────────────────────────────────── */}
        {tracks.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-3">Titel</h2>
            <div className="space-y-0.5">
              {tracks.map((track, index) => {
                const isCurrent = currentTrack?.id === track.id;
                return (
                  <div
                    key={track.id}
                    className={`group grid grid-cols-[32px_1fr_auto] gap-3 px-3 py-2 rounded-md text-sm hover:bg-muted/50 cursor-pointer transition-colors items-center ${isCurrent ? 'bg-muted/40' : ''}`}
                    onClick={() => handlePlayTrack(track)}
                  >
                    {/* Index / play icon */}
                    <span className="text-muted-foreground text-right select-none">
                      <span className="group-hover:hidden">
                        {isCurrent && isPlaying ? (
                          <Music className="h-4 w-4 text-primary mx-auto" />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <Play className="h-4 w-4 hidden group-hover:block text-foreground mx-auto" />
                    </span>

                    {/* Title + album */}
                    <div className="min-w-0">
                      <p className={`truncate font-medium ${isCurrent ? 'text-primary' : ''}`}>
                        {track.title}
                      </p>
                      {track.album && (
                        <p className="text-xs text-muted-foreground truncate">{track.album.title}</p>
                      )}
                    </div>

                    {/* Duration */}
                    <span className="text-muted-foreground tabular-nums text-xs">
                      {formatDuration(track.duration)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Biografie ──────────────────────────────────────────── */}
        {artist.biography && (
          <section>
            <h2 className="text-xl font-semibold mb-3">Über den Künstler</h2>
            <div className="flex gap-6 items-start">
              {artist.imageUrl && (
                <img
                  src={artist.imageUrl}
                  alt={artist.name}
                  className="h-24 w-24 rounded-lg object-cover shrink-0 hidden sm:block"
                />
              )}
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {artist.biography}
              </p>
            </div>
          </section>
        )}

        {/* ── Diskografie ────────────────────────────────────────── */}
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

      {/* ── Edit Modal ─────────────────────────────────────────── */}
      {editOpen && (
        <MetadataEditModal
          type="artist"
          id={artist.id}
          initialData={{
            name: artist.name,
            biography: artist.biography ?? '',
          }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}
