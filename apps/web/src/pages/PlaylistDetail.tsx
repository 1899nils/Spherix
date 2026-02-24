import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PlaylistWithTracks } from '@musicserver/shared';
import { Play, Clock, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/utils';
import { usePlayerStore } from '@/stores/playerStore';

export function PlaylistDetail() {
  const { id } = useParams();
  const { playTrack } = usePlayerStore();

  const { data: playlistData, isLoading } = useQuery({
    queryKey: ['playlist', id],
    queryFn: () => api.get<{ data: PlaylistWithTracks }>(`/playlists/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-8 animate-pulse text-white">Lade Playlist...</div>;

  const playlist = playlistData?.data;

  return (
    <div className="space-y-8">
      <div className="flex items-end gap-6">
        <div className="h-48 w-48 bg-gradient-to-br from-zinc-700 to-zinc-900 rounded-2xl shadow-2xl flex items-center justify-center text-zinc-500">
           <PlayCircle size={80} />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Playlist</p>
          <h1 className="text-6xl font-black text-white">{playlist?.name}</h1>
          <p className="text-muted-foreground">{playlist?.trackCount} Titel</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button className="rounded-full bg-white text-black hover:bg-white/90 px-8 h-12 font-bold">
          Abspielen
        </Button>
      </div>

      <div className="bg-white/5 rounded-2xl overflow-hidden border border-white/5">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/5 text-muted-foreground">
              <th className="px-6 py-4 font-medium w-12">#</th>
              <th className="px-6 py-4 font-medium">Titel</th>
              <th className="px-6 py-4 font-medium w-16 text-right"><Clock className="h-4 w-4 ml-auto" /></th>
              <th className="px-6 py-4 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {playlist?.tracks.map((track, index) => (
              <tr 
                key={track.id} 
                className="hover:bg-white/10 group transition-colors cursor-pointer border-b border-white/5 last:border-0"
                onClick={() => playTrack(track as any)}
              >
                <td className="px-6 py-4 text-muted-foreground tabular-nums">{index + 1}</td>
                <td className="px-6 py-4 font-medium text-white">{track.title}</td>
                <td className="px-6 py-4 text-muted-foreground tabular-nums text-right">{formatDuration(track.duration)}</td>
                <td className="px-6 py-4">
                  <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 h-8 w-8 rounded-full">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { PlayCircle } from 'lucide-react';
