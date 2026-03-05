import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  Play, 
  Pause, 
  Monitor,
  Smartphone,
  Tv,
  Server,
  X,
  Cpu,
  HardDrive,
  Wifi
} from 'lucide-react';

interface StreamSession {
  id: string;
  userName: string;
  mediaType: 'movie' | 'episode';
  mediaTitle: string;
  mediaPoster?: string | null;
  device: string;
  browser: string;
  state: 'playing' | 'paused' | 'buffering';
  position: number;
  duration: number;
  quality: {
    video: string;
    audio: string;
  };
  transcodeInfo?: {
    videoDecision: 'direct' | 'transcode' | 'copy';
    audioDecision: 'direct' | 'transcode' | 'copy';
    videoCodec: string;
    audioCodec: string;
    bandwidth: number;
  };
  transcodeProgress?: number;
  transcodeStatus?: string;
  startedAt: string;
}

interface SessionsResponse {
  data: {
    sessions: StreamSession[];
    count: number;
  };
}

interface SessionStats {
  data: {
    totalSessions: number;
    directPlayCount: number;
    transcodeCount: number;
    totalBandwidth: number;
    byDevice: Record<string, number>;
  };
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatBitrate(bps: number): string {
  if (bps >= 1000000) return `${(bps / 1000000).toFixed(1)} Mbps`;
  if (bps >= 1000) return `${(bps / 1000).toFixed(0)} Kbps`;
  return `${bps} bps`;
}

function getDeviceIcon(device: string) {
  const d = device.toLowerCase();
  if (d.includes('mobile') || d.includes('phone')) return Smartphone;
  if (d.includes('tv') || d.includes('smarttv')) return Tv;
  return Monitor;
}

function getStateIcon(state: string) {
  switch (state) {
    case 'playing': return Play;
    case 'paused': return Pause;
    default: return Activity;
  }
}

function getStateColor(state: string): string {
  switch (state) {
    case 'playing': return 'text-green-400';
    case 'paused': return 'text-amber-400';
    case 'buffering': return 'text-blue-400';
    default: return 'text-white';
  }
}

export function StatusDashboard() {
  const [isOpen, setIsOpen] = useState(false);

  const { data: sessionsData, refetch } = useQuery({
    queryKey: ['streaming-sessions'],
    queryFn: () => api.get<SessionsResponse>('/video/sessions'),
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const { data: statsData } = useQuery({
    queryKey: ['streaming-stats'],
    queryFn: () => api.get<SessionStats>('/video/sessions/stats'),
    refetchInterval: 10000,
  });

  const sessions = sessionsData?.data?.sessions || [];
  const stats = statsData?.data;
  const activeCount = sessions.filter(s => s.state === 'playing').length;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.status-dashboard')) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [isOpen]);

  return (
    <div className="status-dashboard relative">
      {/* Status Button */}
      <Button
        variant="ghost"
        size="sm"
        className={`relative gap-2 ${activeCount > 0 ? 'text-section-accent' : 'text-muted-foreground'}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Activity className="h-4 w-4" />
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 bg-section-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {activeCount}
          </span>
        )}
        <span className="hidden sm:inline">
          {activeCount > 0 ? `${activeCount} aktiv` : 'Status'}
        </span>
      </Button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[480px] max-w-[95vw] bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div>
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Activity className="h-4 w-4 text-section-accent" />
                Aktivität
              </h3>
              <p className="text-xs text-muted-foreground">
                {sessions.length} {sessions.length === 1 ? 'Stream' : 'Streams'} • {stats?.transcodeCount || 0} Transcodes
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-white"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Stats Overview */}
          {stats && (
            <div className="grid grid-cols-3 gap-px bg-white/5">
              <div className="p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                  <Monitor className="h-3.5 w-3.5" />
                  <span className="text-xs">Direct Play</span>
                </div>
                <p className="text-lg font-semibold text-green-400">{stats.directPlayCount}</p>
              </div>
              <div className="p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                  <Cpu className="h-3.5 w-3.5" />
                  <span className="text-xs">Transcodes</span>
                </div>
                <p className="text-lg font-semibold text-amber-400">{stats.transcodeCount}</p>
              </div>
              <div className="p-3 text-center">
                <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                  <Wifi className="h-3.5 w-3.5" />
                  <span className="text-xs">Bandbreite</span>
                </div>
                <p className="text-lg font-semibold text-blue-400">
                  {formatBitrate(stats.totalBandwidth)}
                </p>
              </div>
            </div>
          )}

          {/* Active Sessions */}
          <div className="max-h-[400px] overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Keine aktiven Streams</p>
                <p className="text-xs opacity-60 mt-1">
                  Streams werden hier angezeigt, sobald jemand etwas abspielt
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {sessions.map((session) => (
                  <div key={session.id} className="p-4 hover:bg-white/5 transition-colors">
                    {/* Header: User & Device */}
                    <div className="flex items-start gap-3 mb-3">
                      {/* Device Icon */}
                      <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                        {(() => {
                          const Icon = getDeviceIcon(session.device);
                          return <Icon className="h-5 w-5 text-white/70" />;
                        })()}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-white truncate">
                            {session.mediaTitle}
                          </h4>
                          {(() => {
                            const Icon = getStateIcon(session.state);
                            const color = getStateColor(session.state);
                            return <Icon className={`h-3.5 w-3.5 ${color}`} />;
                          })()}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {session.userName} • {session.device} • {session.browser}
                        </p>
                      </div>
                      
                      {/* Progress */}
                      <div className="text-right shrink-0">
                        <p className="text-xs font-mono text-white/80">
                          {formatDuration(session.position)} / {formatDuration(session.duration)}
                        </p>
                        <div className="w-20 h-1 bg-white/20 rounded-full mt-1 overflow-hidden">
                          <div 
                            className="h-full bg-section-accent"
                            style={{ width: `${(session.position / session.duration) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Transcode / Stream Info */}
                    {session.transcodeInfo && (
                      <div className="space-y-2 pl-[52px]">
                        {/* Video */}
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground w-14">Video</span>
                          <span className="text-white/80">
                            {session.transcodeInfo.videoCodec}
                          </span>
                          <span className="text-white/40">→</span>
                          {session.transcodeInfo.videoDecision === 'direct' ? (
                            <span className="text-green-400 flex items-center gap-1">
                              <Wifi className="h-3 w-3" />
                              Direct Stream
                            </span>
                          ) : session.transcodeInfo.videoDecision === 'transcode' ? (
                            <span className="text-amber-400 flex items-center gap-1">
                              <Cpu className="h-3 w-3" />
                              Transcode
                              {session.transcodeProgress !== undefined && (
                                <span className="text-white/60 ml-1">
                                  ({session.transcodeProgress}%)
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-blue-400">Copy</span>
                          )}
                        </div>

                        {/* Audio */}
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground w-14">Audio</span>
                          <span className="text-white/80">
                            {session.transcodeInfo.audioCodec}
                          </span>
                          <span className="text-white/40">→</span>
                          {session.transcodeInfo.audioDecision === 'direct' ? (
                            <span className="text-green-400">Direct Stream</span>
                          ) : session.transcodeInfo.audioDecision === 'transcode' ? (
                            <span className="text-amber-400">Transcode</span>
                          ) : (
                            <span className="text-blue-400">Copy</span>
                          )}
                        </div>

                        {/* Bandwidth */}
                        {session.transcodeInfo.bandwidth > 0 && (
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground w-14">Netzwerk</span>
                            <span className="text-white/60">
                              {formatBitrate(session.transcodeInfo.bandwidth)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {sessions.length > 0 && (
            <div className="p-3 border-t border-white/10 bg-white/5">
              <p className="text-xs text-center text-muted-foreground">
                Server-Version: Spherix 1.0
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default StatusDashboard;
