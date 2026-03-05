import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Film, Tv, Star, Calendar, Loader2, Link2, Unlink } from 'lucide-react';
import type { TmdbSearchResult, Movie, Series } from '@musicserver/shared';

interface TmdbSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'movie' | 'series';
  item: Movie | Series | null;
}

export function TmdbSearchModal({ isOpen, onClose, type, item }: TmdbSearchModalProps) {
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('');
  const queryClient = useQueryClient();

  // Reset form when item changes
  useState(() => {
    if (item) {
      setQuery(item.title);
      setYear(item.year?.toString() || '');
    }
  });

  const searchQuery = useQuery({
    queryKey: ['tmdb-search', type, query, year],
    queryFn: async () => {
      const params = new URLSearchParams({ q: query });
      if (year) params.set('year', year);
      const endpoint = type === 'movie' ? 'movies' : 'series';
      const res = await api.get<{ data: TmdbSearchResult[] }>(`/tmdb/search/${endpoint}?${params}`);
      return res.data;
    },
    enabled: query.length >= 2 && isOpen,
  });

  const linkMutation = useMutation({
    mutationFn: async (tmdbId: number) => {
      const endpoint = type === 'movie' 
        ? `/video/movies/${item!.id}/link-tmdb` 
        : `/video/series/${item!.id}/link-tmdb`;
      return api.post(endpoint, { tmdbId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [type, item?.id] });
      queryClient.invalidateQueries({ queryKey: [type === 'movie' ? 'movies' : 'series'] });
      queryClient.invalidateQueries({ queryKey: ['unmatched-count'] });
      onClose();
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async () => {
      const endpoint = type === 'movie' 
        ? `/video/movies/${item!.id}/unlink-tmdb` 
        : `/video/series/${item!.id}/unlink-tmdb`;
      return api.post(endpoint, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [type, item?.id] });
      queryClient.invalidateQueries({ queryKey: [type === 'movie' ? 'movies' : 'series'] });
      queryClient.invalidateQueries({ queryKey: ['unmatched-count'] });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchQuery.refetch();
  };

  const hasTmdbLink = !!(item && item.tmdbId);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="TMDb Verknüpfung" maxWidth="2xl">
      <div className="space-y-4">
        {/* Current item info */}
        {item && (
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <div className="flex items-start gap-4">
              <div className="shrink-0 w-16 aspect-[2/3] bg-white/10 rounded overflow-hidden">
                {item.posterPath ? (
                  <img src={item.posterPath} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30">
                    {type === 'movie' ? <Film className="h-6 w-6" /> : <Tv className="h-6 w-6" />}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-white truncate">{item.title}</h3>
                {item.year && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {item.year}
                  </p>
                )}
                {hasTmdbLink && item && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded flex items-center gap-1">
                      <Link2 className="h-3 w-3" />
                      Verknüpft (TMDb ID: {item.tmdbId})
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-red-400 hover:text-red-300"
                      onClick={() => unlinkMutation.mutate()}
                      disabled={unlinkMutation.isPending}
                    >
                      <Unlink className="h-3 w-3 mr-1" />
                      Entfernen
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Search form */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder={`${type === 'movie' ? 'Film' : 'Serie'} suchen...`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-white/5 border-white/10"
            />
          </div>
          <div className="w-24">
            <Input
              placeholder="Jahr"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="bg-white/5 border-white/10"
            />
          </div>
          <Button type="submit" disabled={searchQuery.isFetching || query.length < 2}>
            {searchQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </form>

        {/* Search results */}
        {searchQuery.data && (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {searchQuery.data.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Keine Ergebnisse gefunden</p>
            ) : (
              searchQuery.data.map((result) => (
                <div
                  key={result.tmdbId}
                  className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                >
                  <div className="shrink-0 w-12 aspect-[2/3] bg-white/10 rounded overflow-hidden">
                    {result.posterPath ? (
                      <img 
                        src={result.posterPath} 
                        alt={result.title} 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/30">
                        {type === 'movie' ? <Film className="h-4 w-4" /> : <Tv className="h-4 w-4" />}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-medium text-white">{result.title}</h4>
                        {result.originalTitle !== result.title && (
                          <p className="text-xs text-muted-foreground">{result.originalTitle}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={hasTmdbLink && item?.tmdbId === result.tmdbId ? 'secondary' : 'default'}
                        className="shrink-0"
                        onClick={() => linkMutation.mutate(result.tmdbId)}
                        disabled={linkMutation.isPending || (hasTmdbLink && item?.tmdbId === result.tmdbId)}
                      >
                        {linkMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : hasTmdbLink && item?.tmdbId === result.tmdbId ? (
                          'Aktiv'
                        ) : (
                          'Verknüpfen'
                        )}
                      </Button>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {result.year && <span>{result.year}</span>}
                      {result.rating > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                          {result.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    {result.overview && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                        {result.overview}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
