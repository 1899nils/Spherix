import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MediaCard } from '@/components/ui/MediaCard';
import { Button } from '@/components/ui/button';
import { Tv, AlertCircle, Link2, Search } from 'lucide-react';
import { TmdbSearchModal } from '@/components/video/TmdbSearchModal';
import type { Series as SeriesType } from '@musicserver/shared';

interface SeriesWithCount extends SeriesType {
  _count?: { seasons: number; episodes: number };
}

interface SeriesResponse {
  data: SeriesWithCount[];
  total: number;
}

export function Series() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sort, setSort] = useState('title');
  const [selectedSeries, setSelectedSeries] = useState<SeriesWithCount | null>(null);
  const [showTmdbModal, setShowTmdbModal] = useState(false);

  const showUnmatched = searchParams.get('unmatched') === 'true';

  const { data, isLoading } = useQuery({
    queryKey: ['series', sort, showUnmatched],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('sort', sort);
      params.set('pageSize', '100');
      if (showUnmatched) params.set('unmatched', 'true');
      return api.get<SeriesResponse>(`/video/series?${params}`);
    },
  });

  const shows = data?.data ?? [];

  const handleOpenTmdbModal = (show: SeriesWithCount, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSeries(show);
    setShowTmdbModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Serien</h1>
          {showUnmatched && (
            <span className="px-2 py-1 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full">
              Nicht zugeordnet
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showUnmatched && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSearchParams({})}
            >
              Alle anzeigen
            </Button>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-section-accent"
          >
            <option value="title">Titel A–Z</option>
            <option value="newest">Zuletzt hinzugefügt</option>
            <option value="year">Erscheinungsjahr</option>
          </select>
        </div>
      </div>

      {/* Unmatched warning */}
      {showUnmatched && shows.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-amber-400">Nicht zugeordnete Serien</h3>
            <p className="text-sm text-amber-400/80 mt-1">
              Diese Serien konnten nicht automatisch mit TMDb verknüpft werden. 
              Klicke auf das <Link2 className="h-3 w-3 inline" /> Icon, um sie manuell zuzuordnen.
            </p>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2 animate-pulse">
              <div className="aspect-[2/3] rounded-lg bg-white/5" />
              <div className="h-3 bg-white/5 rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && shows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Tv className="h-12 w-12 opacity-30" />
          <p>Keine Serien gefunden</p>
          {showUnmatched ? (
            <p className="text-xs opacity-60">Alle Serien sind mit TMDb verknüpft!</p>
          ) : (
            <p className="text-xs opacity-60">Starte einen Scan unter Einstellungen → Bibliothek</p>
          )}
        </div>
      )}

      {/* Series grid */}
      {!isLoading && shows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {shows.map((show) => (
            <div key={show.id} className="relative group">
              <MediaCard
                title={show.title}
                year={show.year}
                subtitle={
                  show._count?.seasons
                    ? `${show._count.seasons} Staffel${show._count.seasons !== 1 ? 'n' : ''}`
                    : undefined
                }
                imageUrl={show.posterPath}
                aspect="poster"
                fallbackIcon={<Tv className="h-12 w-12" />}
                onClick={() => navigate(`/video/series/${show.id}`)}
              />
              
              {/* TMDB link button - show for unmatched or on hover */}
              {(showUnmatched || !show.tmdbId) && (
                <button
                  onClick={(e) => handleOpenTmdbModal(show, e)}
                  className={`absolute top-2 right-2 p-2 rounded-full bg-black/60 backdrop-blur-sm 
                    border border-white/20 text-white opacity-0 group-hover:opacity-100 
                    hover:bg-section-accent transition-all ${!show.tmdbId ? 'opacity-100 animate-pulse' : ''}`}
                  title={show.tmdbId ? 'TMDb Verknüpfung bearbeiten' : 'Mit TMDb verknüpfen'}
                >
                  {show.tmdbId ? <Link2 className="h-4 w-4" /> : <Search className="h-4 w-4 text-amber-400" />}
                </button>
              )}

              {/* Unmatched indicator */}
              {!show.tmdbId && (
                <div className="absolute bottom-2 left-2 px-2 py-1 text-[10px] font-medium bg-amber-500/80 text-black rounded">
                  Nicht zugeordnet
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* TMDB Search Modal */}
      <TmdbSearchModal
        isOpen={showTmdbModal}
        onClose={() => setShowTmdbModal(false)}
        type="series"
        item={selectedSeries}
      />
    </div>
  );
}
