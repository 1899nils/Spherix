import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDuration } from '@/lib/utils';
import { Bookmark, Trash2, Music, Clock, Radio } from 'lucide-react';

interface WatchlistItem {
  id: string;
  title: string;
  artist: string;
  albumTitle: string | null;
  coverUrl: string | null;
  duration: number | null;
  source: string;
  mbRecordingId: string | null;
  addedAt: string;
  track: {
    id: string;
    title: string;
    artist: { id: string; name: string };
    album: { id: string; title: string; coverUrl: string | null; year: number | null } | null;
  } | null;
}

interface WatchlistResponse {
  data: WatchlistItem[];
}

function CoverPlaceholder() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-white/5">
      <Music className="h-5 w-5 text-white/20" />
    </div>
  );
}

export function Watchlist() {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data, isLoading } = useQuery<WatchlistResponse>({
    queryKey: ['watchlist'],
    queryFn: () => api.get<WatchlistResponse>('/watchlist'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/watchlist/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      setConfirmDelete(null);
    },
  });

  const items = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center text-white/40">
        Lade Merkliste…
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="flex items-center gap-3 mb-8">
        <Bookmark className="h-6 w-6 text-white/60" />
        <h1 className="text-2xl font-bold text-white">Merkliste</h1>
        {items.length > 0 && (
          <span className="text-sm text-white/40 ml-1">{items.length} {items.length === 1 ? 'Song' : 'Songs'}</span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bookmark className="h-16 w-16 text-white/10 mb-4" />
          <h2 className="text-lg font-medium text-white/60 mb-2">Noch nichts gemerkt</h2>
          <p className="text-sm text-white/30 max-w-sm">
            Beim Radio hören kannst du Songs mit dem{' '}
            <span className="inline-flex items-center gap-1 text-white/50">
              <span className="h-4 w-4 inline-block">+</span>
            </span>{' '}
            Button in der Wiedergabeleiste zur Merkliste hinzufügen.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((item) => {
            const coverUrl = item.track?.album?.coverUrl ?? item.coverUrl;
            const albumTitle = item.track?.album?.title ?? item.albumTitle;

            return (
              <div
                key={item.id}
                className="group flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-white/5 transition-colors"
              >
                {/* Cover */}
                <div className="h-12 w-12 rounded shrink-0 overflow-hidden bg-white/5">
                  {coverUrl ? (
                    <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <CoverPlaceholder />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{item.title}</p>
                  <p className="text-xs text-white/50 truncate">
                    {item.artist}
                    {albumTitle && (
                      <span className="text-white/30"> · {albumTitle}</span>
                    )}
                  </p>
                </div>

                {/* Source badge */}
                <div className="shrink-0 flex items-center gap-1 text-xs text-white/30">
                  {item.source === 'radio' && <Radio className="h-3 w-3" />}
                  <span className="capitalize">{item.source}</span>
                </div>

                {/* Duration */}
                {item.duration && (
                  <div className="shrink-0 flex items-center gap-1 text-xs text-white/30 w-12 text-right">
                    <Clock className="h-3 w-3" />
                    <span>{formatDuration(item.duration)}</span>
                  </div>
                )}

                {/* Delete button */}
                <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {confirmDelete === item.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => removeMutation.mutate(item.id)}
                        className="px-2 py-1 text-xs text-red-400 hover:text-red-300 bg-red-500/10 rounded"
                      >
                        Löschen
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="px-2 py-1 text-xs text-white/40 hover:text-white/60 bg-white/5 rounded"
                      >
                        Abbrechen
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(item.id)}
                      className="p-1.5 text-white/30 hover:text-red-400 transition-colors"
                      title="Von Merkliste entfernen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
