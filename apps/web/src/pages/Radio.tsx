import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Radio as RadioIcon, Play, Signal, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import { usePlayerStore, type RadioStation } from '@/stores/playerStore';

const API = import.meta.env.VITE_API_URL ?? '/api';

interface SavedStation {
  id: string;
  name: string;
  url: string;
  logoUrl: string | null;
  createdAt: string;
}

async function fetchStations(): Promise<SavedStation[]> {
  const res = await fetch(`${API}/radio/stations`);
  if (!res.ok) throw new Error('Failed to fetch stations');
  return res.json();
}

async function createStation(data: { name: string; url: string }): Promise<SavedStation> {
  const res = await fetch(`${API}/radio/stations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to add station');
  return res.json();
}

async function deleteStation(id: string): Promise<void> {
  await fetch(`${API}/radio/stations/${id}`, { method: 'DELETE' });
}

export function Radio() {
  const { playStream, currentTrack, isPlaying } = usePlayerStore();
  const queryClient = useQueryClient();

  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const { data: stations = [], isLoading } = useQuery({
    queryKey: ['radio-stations'],
    queryFn: fetchStations,
  });

  const addMutation = useMutation({
    mutationFn: createStation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['radio-stations'] });
      setShowAddModal(false);
      setName('');
      setUrl('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['radio-stations'] }),
  });

  const handlePlay = (station: SavedStation) => {
    const s: RadioStation = {
      id: station.id,
      name: station.name,
      url: station.url,
      favicon: station.logoUrl ?? undefined,
      isRadio: true,
    };
    playStream(s);
  };

  const handleAdd = () => {
    if (!name.trim() || !url.trim()) return;
    addMutation.mutate({ name: name.trim(), url: url.trim() });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">Radio</h1>
          <p className="text-muted-foreground mt-1">Deine Sender</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setShowAddModal(true)}
            className="bg-pink-500 hover:bg-pink-400 text-white rounded-xl gap-2 px-5"
          >
            <Plus className="h-4 w-4" />
            Sender hinzufügen
          </Button>
          <div className="h-12 w-12 bg-pink-500/10 rounded-2xl flex items-center justify-center border border-pink-500/20 shadow-lg shadow-pink-500/5">
            <RadioIcon className="h-6 w-6 text-pink-500" />
          </div>
        </div>
      </div>

      {/* Station Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-square bg-white/5 animate-pulse rounded-2xl border border-white/5" />
          ))}
        </div>
      ) : stations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center gap-4">
          <div className="h-20 w-20 bg-pink-500/10 rounded-3xl flex items-center justify-center border border-pink-500/20">
            <RadioIcon className="h-10 w-10 text-pink-500/60" />
          </div>
          <div>
            <p className="text-white font-semibold text-lg">Noch keine Sender</p>
            <p className="text-muted-foreground mt-1 text-sm">Füge deinen ersten Sender hinzu</p>
          </div>
          <Button
            onClick={() => setShowAddModal(true)}
            className="bg-pink-500 hover:bg-pink-400 text-white rounded-xl gap-2 mt-2"
          >
            <Plus className="h-4 w-4" />
            Sender hinzufügen
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
          {stations.map((station) => {
            const isCurrent = !!(currentTrack && 'id' in currentTrack && currentTrack.id === station.id);
            const isThisPlaying = isCurrent && isPlaying;
            const hasImageFailed = failedImages.has(station.id);

            return (
              <div
                key={station.id}
                className={`group relative bg-[#1c1c1e] p-5 rounded-2xl border transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/50 ${
                  isCurrent ? 'border-pink-500/50 bg-pink-500/5' : 'border-white/5 hover:bg-white/5'
                }`}
              >
                {/* Delete button */}
                <button
                  className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-red-500/80 rounded-full p-1.5"
                  onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(station.id); }}
                  title="Sender entfernen"
                >
                  <Trash2 className="h-3.5 w-3.5 text-white" />
                </button>

                {/* Cover / Logo */}
                <div className="aspect-square rounded-xl overflow-hidden mb-4 relative shadow-inner bg-black/20 flex items-center justify-center border border-white/5">
                  {station.logoUrl && !hasImageFailed ? (
                    <img
                      src={station.logoUrl}
                      alt={station.name}
                      className="w-2/3 h-2/3 object-contain transition-transform duration-500 group-hover:scale-110"
                      onError={() => setFailedImages((prev) => new Set(prev).add(station.id))}
                    />
                  ) : (
                    <span className="text-4xl">📻</span>
                  )}

                  {/* Play Overlay */}
                  <div className={`absolute inset-0 bg-black/40 transition-opacity flex items-center justify-center ${
                    isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}>
                    <Button
                      variant="secondary"
                      size="icon"
                      className={`rounded-full h-14 w-14 shadow-2xl transition-transform active:scale-90 ${
                        isCurrent ? 'bg-pink-500 text-white hover:bg-pink-400' : 'bg-white text-black hover:bg-white/90'
                      }`}
                      onClick={() => handlePlay(station)}
                    >
                      {isThisPlaying ? (
                        <Signal className="h-7 w-7 animate-bounce" />
                      ) : (
                        <Play className="h-7 w-7 fill-current ml-1" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1 min-w-0">
                  <h3 className={`font-bold text-sm truncate ${isCurrent ? 'text-pink-400' : 'text-white'}`}>
                    {station.name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground truncate uppercase tracking-wider font-semibold">
                    Live Radio
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Station Modal */}
      <Modal
        title="Sender hinzufügen"
        isOpen={showAddModal}
        onClose={() => { setShowAddModal(false); setName(''); setUrl(''); }}
        maxWidth="max-w-md"
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. FFH"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-pink-500/50 focus:bg-white/8 transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Stream-URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="z.B. http://mp3.ffh.de/radioffh/hqlivestream.mp3"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-zinc-500 focus:outline-none focus:border-pink-500/50 focus:bg-white/8 transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <p className="text-xs text-zinc-500">MP3/AAC-Streams oder M3U/PLS-Playlists</p>
          </div>

          {addMutation.isError && (
            <p className="text-sm text-red-400">Fehler beim Hinzufügen. Bitte URL prüfen.</p>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              className="flex-1 rounded-xl border border-white/10 hover:bg-white/5"
              onClick={() => { setShowAddModal(false); setName(''); setUrl(''); }}
            >
              Abbrechen
            </Button>
            <Button
              className="flex-1 bg-pink-500 hover:bg-pink-400 text-white rounded-xl gap-2"
              onClick={handleAdd}
              disabled={!name.trim() || !url.trim() || addMutation.isPending}
            >
              {addMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Logo wird geladen…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Hinzufügen
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
