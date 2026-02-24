import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AlbumWithRelations, TrackWithRelations, PaginatedResponse } from '@musicserver/shared';
import { Button } from '@/components/ui/button';
import { Play, MoreHorizontal } from 'lucide-react';
import { usePlayerStore } from '@/stores/playerStore';

export function RecentlyAdded() {
  const [view, setView] = useState<'albums' | 'tracks'>('albums');
  const { playTrack } = usePlayerStore();

  const { data: albumsData, isLoading: albumsLoading } = useQuery({
    queryKey: ['albums', 'newest'],
    queryFn: () => api.get<PaginatedResponse<AlbumWithRelations>>('/albums?sort=newest&pageSize=20'),
    enabled: view === 'albums',
  });

  const { data: tracksData, isLoading: tracksLoading } = useQuery({
    queryKey: ['tracks', 'newest'],
    queryFn: () => api.get<PaginatedResponse<TrackWithRelations>>('/tracks?sort=newest&pageSize=50'),
    enabled: view === 'tracks',
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Zuletzt hinzugefügt</h1>
          <p className="text-muted-foreground mt-1">Deine neuesten Entdeckungen</p>
        </div>
        
        <div className="bg-white/5 p-1 rounded-lg flex gap-1">
          <Button 
            variant={view === 'albums' ? 'secondary' : 'ghost'} 
            size="sm" 
            onClick={() => setView('albums')}
            className="text-xs h-8 px-4"
          >
            Alben
          </Button>
          <Button 
            variant={view === 'tracks' ? 'secondary' : 'ghost'} 
            size="sm" 
            onClick={() => setView('tracks')}
            className="text-xs h-8 px-4"
          >
            Titel
          </Button>
        </div>
      </div>

      {view === 'albums' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {albumsLoading ? (
             Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="aspect-square bg-white/5 animate-pulse rounded-xl" />
             ))
          ) : (
            albumsData?.data.map((album) => (
              <div key={album.id} className="group relative bg-white/5 p-4 rounded-2xl hover:bg-white/10 transition-all duration-300">
                <div className="aspect-square rounded-lg overflow-hidden shadow-lg mb-4 relative">
                  {album.coverUrl ? (
                    <img src={album.coverUrl} alt={album.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-600">♪</div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button variant="secondary" size="icon" className="rounded-full h-12 w-12 bg-white text-black shadow-xl">
                      <Play className="h-6 w-6 fill-current" />
                    </Button>
                  </div>
                </div>
                <h3 className="font-semibold text-sm text-white truncate">{album.title}</h3>
                <p className="text-xs text-muted-foreground truncate">{album.artist.name}</p>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-white/5 rounded-2xl overflow-hidden border border-white/5">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/5 text-muted-foreground">
                <th className="px-6 py-4 font-medium">Titel</th>
                <th className="px-6 py-4 font-medium">Album</th>
                <th className="px-6 py-4 font-medium">Datum</th>
                <th className="px-6 py-4 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {tracksLoading ? (
                 Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="animate-pulse border-b border-white/5"><td colSpan={4} className="h-12 bg-white/5"></td></tr>
                 ))
              ) : (
                tracksData?.data.map((track) => (
                  <tr 
                    key={track.id} 
                    className="hover:bg-white/10 group transition-colors cursor-pointer border-b border-white/5 last:border-0"
                    onClick={() => playTrack(track)}
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
                    <td className="px-6 py-3 text-muted-foreground tabular-nums">
                       {new Date(track.createdAt).toLocaleDateString('de-DE')}
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
      )}
    </div>
  );
}
