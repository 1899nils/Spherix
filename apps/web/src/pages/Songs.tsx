import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { TrackWithRelations, PaginatedResponse } from '@musicserver/shared';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Clock } from 'lucide-react';
import { usePlayerStore } from '@/stores/playerStore';
import { formatDuration } from '@/lib/utils';

export function Songs() {
  const { playTrack } = usePlayerStore();

  const { data: tracksData, isLoading } = useQuery({
    queryKey: ['tracks', 'all'],
    queryFn: () => api.get<PaginatedResponse<TrackWithRelations>>('/tracks?pageSize=100'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Titel</h1>
        <p className="text-muted-foreground mt-1">Alle Songs in deiner Mediathek</p>
      </div>

      <div className="bg-white/5 rounded-2xl overflow-hidden border border-white/5">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/5 text-muted-foreground">
              <th className="px-6 py-4 font-medium">Titel</th>
              <th className="px-6 py-4 font-medium">Album</th>
              <th className="px-6 py-4 font-medium w-16 text-right"><Clock className="h-4 w-4 ml-auto" /></th>
              <th className="px-6 py-4 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
               Array.from({ length: 20 }).map((_, i) => (
                  <tr key={i} className="animate-pulse border-b border-white/5"><td colSpan={4} className="h-12 bg-white/5"></td></tr>
               ))
            ) : (
              tracksData?.data.map((track) => (
                <tr 
                  key={track.id} 
                  className="hover:bg-white/10 group transition-colors cursor-pointer border-b border-white/5 last:border-0"
                  onClick={() => playTrack(track as TrackWithRelations)}
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded bg-white/5 overflow-hidden flex-shrink-0">
                         {track.album?.coverUrl && <img src={track.album.coverUrl} className="w-full h-full object-cover" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-white truncate">{track.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{track.artist.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground truncate max-w-[200px]">{track.album?.title}</td>
                  <td className="px-6 py-3 text-muted-foreground tabular-nums text-right">
                     {formatDuration(track.duration)}
                  </td>
                  <td className="px-6 py-3">
                     <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 h-8 w-8 rounded-full">
                        <MoreHorizontal className="h-4 w-4" />
                     </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
