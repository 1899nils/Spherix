import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/utils';
import { usePlayerStore } from '@/stores/playerStore';
import { MetadataEditModal } from '@/components/MetadataEditModal';
import { MusicBrainzLinkModal } from '@/components/MusicBrainzLinkModal';
import type { AlbumDetail as AlbumDetailType, ApiResponse, TrackWithRelations } from '@musicserver/shared';
import { Play, Pause, Disc3, Pencil, ExternalLink } from 'lucide-react';

export function AlbumDetail() {
  const { id } = useParams<{ id: string }>();
  const [editOpen, setEditOpen] = useState(false);
  const [mbOpen, setMbOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['album', id],
    queryFn: () => api.get<ApiResponse<AlbumDetailType>>(`/albums/${id}`),
    enabled: !!id,
  });

  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayerStore();

  const album = data?.data;

  if (isLoading) {
    return <div className="text-muted-foreground p-8">Lade Album...</div>;
  }

  if (!album) {
    return <div className="text-muted-foreground p-8">Album nicht gefunden</div>;
  }

  const tracks = album.tracks ?? [];
  const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);
  const totalMins = Math.floor(totalDuration / 60);

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    }
  };

  const handlePlayTrack = (track: TrackWithRelations) => {
    playTrack(track, tracks);
  };

  const isCurrentAlbumPlaying = currentTrack && tracks.some((t) => t.id === currentTrack.id) && isPlaying;

  // Group tracks by disc if multi-disc
  const hasMultipleDiscs = new Set(tracks.map((t) => t.discNumber)).size > 1;

  return (
    <div className="space-y-6">
      {/* Album Header */}
      <div className="flex gap-6 items-end">
        {/* Cover */}
        <div className="h-48 w-48 rounded-lg overflow-hidden bg-muted shrink-0 shadow-lg">
          {album.coverUrl ? (
            <img
              src={album.coverUrl}
              alt={album.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
              <Disc3 className="h-16 w-16" />
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="space-y-2 min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Album</p>
          <h1 className="text-3xl font-bold truncate">{album.title}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link
              to={`/artists/${album.artist.id}`}
              className="font-medium text-foreground hover:underline"
            >
              {album.artist.name}
            </Link>
            {album.year && <span>&middot; {album.year}</span>}
            {album.genre && <span>&middot; {album.genre}</span>}
            <span>&middot; {tracks.length} Tracks</span>
            <span>&middot; {totalMins} Min.</span>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button onClick={isCurrentAlbumPlaying ? togglePlay : handlePlayAll} size="sm">
              {isCurrentAlbumPlaying ? (
                <Pause className="h-4 w-4 mr-1" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              {isCurrentAlbumPlaying ? 'Pause' : 'Alle abspielen'}
            </Button>

            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-1" />
              Metadaten bearbeiten
            </Button>

            <Button variant="outline" size="sm" onClick={() => setMbOpen(true)}>
              <ExternalLink className="h-4 w-4 mr-1" />
              MusicBrainz
              {album.musicbrainzId && (
                <span className="ml-1 h-2 w-2 rounded-full bg-primary inline-block" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Track List */}
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_80px] gap-4 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">
          <span className="w-8">#</span>
          <span>Titel</span>
          <span className="text-right">Dauer</span>
        </div>

        {/* Tracks */}
        {tracks.map((track, index) => {
          const isCurrent = currentTrack?.id === track.id;
          const showDiscHeader = hasMultipleDiscs &&
            (index === 0 || tracks[index - 1].discNumber !== track.discNumber);

          return (
            <div key={track.id}>
              {showDiscHeader && (
                <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20 border-b border-border">
                  Disc {track.discNumber}
                </div>
              )}
              <div
                className={`group grid grid-cols-[auto_1fr_80px] gap-4 px-4 py-2 text-sm hover:bg-muted/50 cursor-pointer transition-colors ${isCurrent ? 'bg-muted/30' : ''}`}
                onClick={() => handlePlayTrack(track)}
              >
                <span className="w-8 text-muted-foreground flex items-center">
                  <span className="group-hover:hidden">
                    {isCurrent && isPlaying ? '♪' : track.trackNumber}
                  </span>
                  <Play className="h-4 w-4 hidden group-hover:block text-foreground" />
                </span>
                <div className="min-w-0">
                  <p className={`truncate ${isCurrent ? 'text-primary font-medium' : ''}`}>
                    {track.title}
                  </p>
                  {track.artist.id !== album.artist.id && (
                    <p className="text-xs text-muted-foreground truncate">
                      {track.artist.name}
                    </p>
                  )}
                </div>
                <span className="text-muted-foreground text-right self-center tabular-nums">
                  {formatDuration(track.duration)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Album Info Footer */}
      {(album.label || album.country) && (
        <div className="text-xs text-muted-foreground space-y-1">
          {album.label && <p>Label: {album.label}</p>}
          {album.country && <p>Land: {album.country}</p>}
        </div>
      )}

      {/* Metadata Edit Modal */}
      {editOpen && (
        <MetadataEditModal
          type="album"
          id={album.id}
          initialData={{
            title: album.title,
            year: album.year,
            genre: album.genre,
          }}
          onClose={() => setEditOpen(false)}
          onOpenMusicBrainz={() => {
            setEditOpen(false);
            setMbOpen(true);
          }}
        />
      )}

      {/* MusicBrainz Link Modal */}
      {mbOpen && (
        <MusicBrainzLinkModal
          albumId={album.id}
          albumTitle={album.title}
          artistName={album.artist.name}
          musicbrainzId={album.musicbrainzId}
          onClose={() => setMbOpen(false)}
        />
      )}
    </div>
  );
}
