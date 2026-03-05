import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { 
  RefreshCw, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Film,
  Tv,
  Clock,
  XCircle
} from 'lucide-react';
import type { VideoScanProgress } from '@musicserver/shared';

interface ScanStatusResponse {
  data: {
    isScanning: boolean;
    progress: VideoScanProgress | null;
    jobId: string | null;
    videoPath: string;
  };
}

export function VideoScanButton() {
  const [showDetails, setShowDetails] = useState(false);
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ['video-scan-status'],
    queryFn: () => api.get<ScanStatusResponse>('/video/scan/status'),
    refetchInterval: (data) => {
      // Poll every 2 seconds while scanning
      return data?.data?.isScanning ? 2000 : false;
    },
  });

  const scanMutation = useMutation({
    mutationFn: () => api.post('/video/scan/trigger', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video-scan-status'] });
    },
  });

  const status = statusQuery.data?.data;
  const isScanning = status?.isScanning ?? false;
  const progress = status?.progress;

  const getProgressText = () => {
    if (!progress) return 'Wird gestartet...';
    
    switch (progress.phase) {
      case 'discovering':
        return `Dateien werden gesucht... (${progress.total} gefunden)`;
      case 'scanning':
        return `Wird gescannt... ${progress.done}/${progress.total}`;
      case 'cleanup':
        return 'Bereinigung...';
      case 'done':
        return 'Abgeschlossen!';
      case 'error':
        return `Fehler: ${progress.message}`;
      default:
        return 'Wird verarbeitet...';
    }
  };

  const getProgressPercent = () => {
    if (!progress || progress.total === 0) return 0;
    return Math.round((progress.done / progress.total) * 100);
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 text-muted-foreground hover:text-white"
        onClick={() => isScanning ? setShowDetails(!showDetails) : scanMutation.mutate()}
        disabled={scanMutation.isPending}
      >
        {isScanning ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-section-accent" />
            <span className="hidden sm:inline">Scan läuft...</span>
          </>
        ) : scanMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="hidden sm:inline">Starte...</span>
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Scan starten</span>
          </>
        )}
      </Button>

      {/* Details Dropdown */}
      {showDetails && isScanning && progress && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-black/90 backdrop-blur-xl border border-white/10 rounded-lg shadow-xl p-4 z-50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-sm">Scan-Status</h4>
            <button 
              onClick={() => setShowDetails(false)}
              className="text-muted-foreground hover:text-white"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{getProgressText()}</span>
                <span>{getProgressPercent()}%</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-section-accent transition-all duration-300"
                  style={{ width: `${getProgressPercent()}%` }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white/5 rounded p-2">
                <Film className="h-4 w-4 mx-auto mb-1 text-blue-400" />
                <p className="text-lg font-semibold">{progress.movies}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Filme</p>
              </div>
              <div className="bg-white/5 rounded p-2">
                <Tv className="h-4 w-4 mx-auto mb-1 text-purple-400" />
                <p className="text-lg font-semibold">{progress.episodes}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Episoden</p>
              </div>
              <div className="bg-white/5 rounded p-2">
                <CheckCircle2 className="h-4 w-4 mx-auto mb-1 text-green-400" />
                <p className="text-lg font-semibold">{progress.skipped}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Übersprungen</p>
              </div>
            </div>

            {progress.errors > 0 && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded p-2">
                <AlertCircle className="h-4 w-4" />
                <span>{progress.errors} Fehler aufgetreten</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Unmatched count badge component
export function UnmatchedBadge({ type }: { type: 'movies' | 'series' }) {
  const { data } = useQuery({
    queryKey: ['unmatched-count', type],
    queryFn: async () => {
      const endpoint = type === 'movies' 
        ? '/video/movies/unmatched/count' 
        : '/video/series/unmatched/count';
      return api.get<{ data: { count: number } }>(endpoint);
    },
  });

  const count = data?.data?.count ?? 0;
  
  if (count === 0) return null;

  return (
    <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full">
      {count}
    </span>
  );
}
