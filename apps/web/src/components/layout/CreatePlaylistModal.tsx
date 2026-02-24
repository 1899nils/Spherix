import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { TrackWithRelations, PaginatedResponse } from '@musicserver/shared';
import { X, Search, Music, Check, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CreatePlaylistModalProps {
  onClose: () => void;
}

export function CreatePlaylistModal({ onClose }: CreatePlaylistModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);

  const { data: tracksData, isLoading: tracksLoading } = useQuery({
    queryKey: ['tracks', 'search', searchQuery],
    queryFn: () => api.get<PaginatedResponse<TrackWithRelations>>(`/tracks?pageSize=50${searchQuery ? `&q=${searchQuery}` : ''}`),
  });

  const createPlaylist = useMutation({
    mutationFn: (data: { name: string; coverUrl?: string; trackIds: string[] }) => 
      api.post('/playlists', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      onClose();
    },
  });

  const toggleTrack = (id: string) => {
    setSelectedTracks(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    if (!name) return;
    createPlaylist.mutate({ 
      name, 
      coverUrl: coverUrl || undefined, 
      trackIds: selectedTracks 
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div 
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-full max-w-5xl h-[85vh] flex flex-col bg-[#1c1c1e] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-white/5 shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Neue Playlist erstellen</h2>
            <p className="text-sm text-muted-foreground mt-1">Gestalte deine eigene Musiksammlung</p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="hover:bg-white/10 rounded-full h-10 w-10"
            onClick={onClose}
          >
            <X className="h-6 w-6 text-zinc-400" />
          </Button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* ... Rest of the modal content ... */}
          {/* Left: Details */}
          <div className="w-1/3 border-r border-white/5 p-8 space-y-8 overflow-y-auto">
            <div className="space-y-4">
              <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Playlist-Details</label>
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Name der Playlist"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                />
                <div className="relative">
                  <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Bild-URL (optional)"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="aspect-square w-full bg-white/5 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-white/5 group transition-colors hover:border-white/10 overflow-hidden relative">
              {coverUrl ? (
                <img src={coverUrl} className="w-full h-full object-cover" alt="Preview" />
              ) : (
                <>
                  <Music className="h-12 w-12 text-zinc-700 mb-2" />
                  <p className="text-xs text-zinc-600">Kein Bild ausgewählt</p>
                </>
              )}
            </div>

            <div className="pt-4">
              <Button 
                className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-900/20 disabled:opacity-50"
                disabled={!name || createPlaylist.isPending}
                onClick={handleSave}
              >
                {createPlaylist.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Playlist speichern'}
              </Button>
            </div>
          </div>

          {/* Right: Track Selection */}
          <div className="flex-1 flex flex-col p-8 space-y-6 overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
              <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Songs hinzufügen ({selectedTracks.length} ausgewählt)</label>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Songs suchen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/5 rounded-full pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:bg-white/10 transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              <div className="space-y-1">
                {tracksLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-14 bg-white/5 animate-pulse rounded-xl" />
                  ))
                ) : (
                  tracksData?.data.map((track) => {
                    const isSelected = selectedTracks.includes(track.id);
                    return (
                      <div 
                        key={track.id}
                        className={`group flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all ${
                          isSelected ? 'bg-blue-600/20 border border-blue-500/30' : 'hover:bg-white/5 border border-transparent'
                        }`}
                        onClick={() => toggleTrack(track.id)}
                      >
                        <div className="h-10 w-10 rounded-lg bg-zinc-800 overflow-hidden shrink-0 shadow-md">
                          {track.album?.coverUrl && <img src={track.album.coverUrl} className="w-full h-full object-cover" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold truncate ${isSelected ? 'text-blue-400' : 'text-white'}`}>{track.title}</p>
                          <p className="text-xs text-zinc-500 truncate">{track.artist.name}</p>
                        </div>
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center transition-all ${
                          isSelected ? 'bg-blue-500 text-white' : 'bg-white/5 group-hover:bg-white/10 text-transparent'
                        }`}>
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
