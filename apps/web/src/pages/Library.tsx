import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PaginatedResponse, TrackWithRelations } from '@musicserver/shared';
import { usePlayerStore } from '@/stores/playerStore';
import { Play, Music2 } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

export function Library() {
  const { data, isLoading } = useQuery({
    queryKey: ['tracks'],
    queryFn: () =>
      api.get<PaginatedResponse<TrackWithRelations>>('/tracks?pageSize=100'),
  });

  const { playTrack, currentTrack, isPlaying } = usePlayerStore();

  const tracks = data?.data ?? [];

  const handlePlayTrack = (track: TrackWithRelations) => {
    playTrack(track, tracks);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bibliothek</h1>
        <p className="text-muted-foreground mt-1">Alle Tracks</p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Lade Tracks...</div>
      ) : tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Music2 className="h-12 w-12 mb-4" />
          <p>Keine Tracks gefunden</p>
          <p className="text-sm mt-1">Scanne eine Bibliothek in den Einstellungen</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[auto_1fr_1fr_80px] gap-4 px-4 py-2 text-xs text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">
            <span className="w-8">#</span>
            <span>Titel</span>
            <span>Album</span>
            <span className="text-right">Dauer</span>
          </div>

          {/* Tracks */}
          {tracks.map((track, index) => {
            const isCurrent = currentTrack?.id === track.id;
            return (
              <div
                key={track.id}
                className={`group grid grid-cols-[auto_1fr_1fr_80px] gap-4 px-4 py-2 text-sm hover:bg-muted/50 cursor-pointer transition-colors ${isCurrent ? 'bg-muted/30' : ''}`}
                onClick={() => handlePlayTrack(track)}
              >
                <span className="w-8 text-muted-foreground flex items-center">
                  <span className="group-hover:hidden">
                    {isCurrent && isPlaying ? '♪' : index + 1}
                  </span>
                  <Play className="h-4 w-4 hidden group-hover:block text-foreground" />
                </span>
                <div className="min-w-0">
                  <p className={`truncate ${isCurrent ? 'text-primary font-medium' : ''}`}>
                    {track.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {track.artist.name}
                  </p>
                </div>
                <span className="text-muted-foreground truncate self-center">
                  {track.album?.title ?? '—'}
                </span>
                <span className="text-muted-foreground text-right self-center tabular-nums">
                  {formatDuration(track.duration)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
