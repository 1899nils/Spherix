import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import type { ItunesSearchResult } from '@musicserver/shared';
import { Search, Loader2, X, Plus, Check } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export function PodcastSearchModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItunesSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState<Set<string>>(new Set());

  const subscribeMutation = useMutation({
    mutationFn: ({ feedUrl, itunesId }: { feedUrl: string; itunesId: string }) =>
      api.post('/podcasts/subscribe', { feedUrl, itunesId }),
    onSuccess: (_data, vars) => {
      setSubscribed((prev) => new Set([...prev, vars.feedUrl]));
      queryClient.invalidateQueries({ queryKey: ['podcasts'] });
    },
  });

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await api.get<{ data: ItunesSearchResult[] }>(
        `/podcasts/search?q=${encodeURIComponent(query.trim())}`,
      );
      setResults(res.data ?? []);
    } catch (err) {
      setSearchError((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold">Podcast suchen & abonnieren</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-2 px-6 py-4 border-b border-border shrink-0">
          <input
            autoFocus
            type="text"
            placeholder="Podcast suchen (z.B. Lex Fridman, Fest & Flauschig…)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button type="submit" size="sm" disabled={searching || !query.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>

        {/* Results */}
        <div className="overflow-y-auto flex-1 px-4 py-2">
          {searchError && (
            <p className="text-sm text-red-500 px-2 py-4">{searchError}</p>
          )}

          {!searching && results.length === 0 && !searchError && (
            <p className="text-sm text-muted-foreground text-center py-12">
              Suche nach einem Podcast, um Ergebnisse zu sehen
            </p>
          )}

          {results.map((item) => {
            const alreadySubscribed = subscribed.has(item.feedUrl);
            const isSubscribing =
              subscribeMutation.isPending &&
              subscribeMutation.variables?.feedUrl === item.feedUrl;

            return (
              <div
                key={item.collectionId}
                className="flex items-center gap-4 px-2 py-3 rounded-lg hover:bg-muted/40 transition-colors"
              >
                {/* Artwork */}
                <div className="h-16 w-16 rounded-lg overflow-hidden bg-muted shrink-0">
                  {item.artworkUrl600 ? (
                    <img
                      src={item.artworkUrl600}
                      alt={item.collectionName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-2xl">🎙️</div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.collectionName}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.artistName}</p>
                  {item.genres?.length > 0 && (
                    <p className="text-xs text-muted-foreground/60 truncate mt-0.5">
                      {item.genres.slice(0, 2).join(' · ')}
                    </p>
                  )}
                </div>

                {/* Subscribe button */}
                <Button
                  size="sm"
                  variant={alreadySubscribed ? 'outline' : 'default'}
                  disabled={alreadySubscribed || isSubscribing || !item.feedUrl}
                  onClick={() =>
                    subscribeMutation.mutate({
                      feedUrl: item.feedUrl,
                      itunesId: String(item.collectionId),
                    })
                  }
                  className="shrink-0"
                >
                  {isSubscribing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : alreadySubscribed ? (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Abonniert
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Abonnieren
                    </>
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        {subscribeMutation.isError && (
          <p className="text-xs text-red-500 px-6 py-2 border-t border-border shrink-0">
            {(subscribeMutation.error as Error).message}
          </p>
        )}
      </div>
    </div>
  );
}
