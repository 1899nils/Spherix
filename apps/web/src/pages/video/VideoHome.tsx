import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { VideoScanButton, UnmatchedBadge } from '@/components/video/VideoScanButton';
import { 
  Film, 
  Tv, 
  Clock, 
  Star, 
  FolderSearch,
  AlertCircle,
  ChevronRight
} from 'lucide-react';

interface UnmatchedCountResponse {
  data: { count: number };
}

export function VideoHome() {
  const navigate = useNavigate();

  const unmatchedMovies = useQuery({
    queryKey: ['unmatched-count', 'movies'],
    queryFn: () => api.get<UnmatchedCountResponse>('/video/movies/unmatched/count'),
  });

  const unmatchedSeries = useQuery({
    queryKey: ['unmatched-count', 'series'],
    queryFn: () => api.get<UnmatchedCountResponse>('/video/series/unmatched/count'),
  });

  const totalUnmatched = (unmatchedMovies.data?.data?.count ?? 0) + (unmatchedSeries.data?.data?.count ?? 0);

  const menuItems = [
    {
      icon: Film,
      label: 'Filme',
      description: 'Durchsuche deine Filmsammlung',
      path: '/video/movies',
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      icon: Tv,
      label: 'Serien',
      description: 'Entdecke deine Serien',
      path: '/video/series',
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
    {
      icon: Clock,
      label: 'Weiterschauen',
      description: 'Setze dort fort, wo du aufgehört hast',
      path: '/video/continue',
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      icon: Star,
      label: 'Favoriten',
      description: 'Deine markierten Titel',
      path: '/video/favorites',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Video-Bibliothek</h1>
          <p className="text-muted-foreground text-sm">Verwalte deine Filme und Serien</p>
        </div>
        <VideoScanButton />
      </div>

      {/* Unmatched warning */}
      {totalUnmatched > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-amber-400">Nicht zugeordnete Titel</h3>
            <p className="text-sm text-amber-400/80 mt-1">
              {unmatchedMovies.data?.data?.count ?? 0} Filme und{' '}
              {unmatchedSeries.data?.data?.count ?? 0} Serien konnten nicht mit TMDb verknüpft werden.
            </p>
            <div className="flex gap-2 mt-3">
              <Button 
                variant="outline" 
                size="sm" 
                className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                onClick={() => navigate('/video/movies?unmatched=true')}
              >
                <Film className="h-4 w-4 mr-2" />
                Filme anzeigen
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                onClick={() => navigate('/video/series?unmatched=true')}
              >
                <Tv className="h-4 w-4 mr-2" />
                Serien anzeigen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Menu Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {menuItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-left group"
          >
            <div className={`w-12 h-12 rounded-xl ${item.bgColor} flex items-center justify-center shrink-0`}>
              <item.icon className={`h-6 w-6 ${item.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white">{item.label}</h3>
                {item.label === 'Filme' && <UnmatchedBadge type="movies" />}
                {item.label === 'Serien' && <UnmatchedBadge type="series" />}
              </div>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-white transition-colors" />
          </button>
        ))}
      </div>

      {/* Quick actions */}
      <div className="pt-4 border-t border-white/10">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Schnellzugriff</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/video/recently-added')}>
            <Clock className="h-4 w-4 mr-2" />
            Zuletzt hinzugefügt
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/video/genres')}>
            <FolderSearch className="h-4 w-4 mr-2" />
            Nach Genre
          </Button>
        </div>
      </div>
    </div>
  );
}
