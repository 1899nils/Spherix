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
  X,
  Cpu,
  HardDrive,
  Wifi,
  Clock,
  History,
  Layers,
  BarChart3,
  MemoryStick
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

interface SystemStats {
  cpu: {
    load: number;
    cores: number;
  };
  memory: {
    used: string;
    total: string;
    percentage: number;
  };
  uptime: string;
}

interface TranscodeQueueItem {
  id: string;
  mediaTitle: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
}

interface SessionsResponse {
  data: {
    sessions: StreamSession[];
    count: number;
    system: SystemStats | null;
    transcodeQueue: TranscodeQueueItem[];
  };
}

interface HistoryItem {
  id: string;
  userName: string;
  mediaTitle: string;
  mediaType: 'movie' | 'episode';
  device: string;
  startedAt: string;
  endedAt: string;
  duration: number;
  decision: 'direct' | 'transcode';
}

interface HistoryResponse {
  data: {
    history: HistoryItem[];
    total: number;
  };
}

interface DetailedSystemStats {
  data: {
    cpu: {
      load: number;
      loadHistory: number[];
      cores: number;
    };
    memory: {
      used: string;
      total: string;
      free: string;
      percentage: number;
    };
    disk: {
      used: string;
      total: string;
      free: string;
      percentage: number;
    };
    network: {
      rxSec: string;
      txSec: string;
    };
    uptime: string;
  };
}

type TabType = 'activity' | 'system' | 'queue' | 'history';

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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
  const [activeTab, setActiveTab] = useState<TabType>('activity');

  const { data: sessionsData } = useQuery({
    queryKey: ['streaming-sessions'],
    queryFn: () => api.get<SessionsResponse>('/video/sessions'),
    refetchInterval: 5000,
  });

  const { data: historyData } = useQuery({
    queryKey: ['streaming-history'],
    queryFn: () => api.get<HistoryResponse>('/video/sessions/history'),
    enabled: activeTab === 'history',
  });

  const { data: systemData } = useQuery({
    queryKey: ['streaming-system'],
    queryFn: () => api.get<DetailedSystemStats>('/video/sessions/system'),
    enabled: activeTab === 'system',
    refetchInterval: 2000,
  });

  const sessions = sessionsData?.data?.sessions || [];
  const system = sessionsData?.data?.system;
  const queue = sessionsData?.data?.transcodeQueue || [];
  const history = historyData?.data?.history || [];
  const detailedSystem = systemData?.data;
  
  const activeCount = sessions.filter(s => s.state === 'playing').length;

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
        <div className="absolute right-0 top-full mt-2 w-[520px] max-w-[95vw] bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
          {/* Header with Tabs */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
              <button
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'activity' ? 'bg-section-accent text-white' : 'text-white/60 hover:text-white'
                }`}
                onClick={() => setActiveTab('activity')}
              >
                <Activity className="h-3.5 w-3.5 inline mr-1.5" />
                Aktivität
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'system' ? 'bg-section-accent text-white' : 'text-white/60 hover:text-white'
                }`}
                onClick={() => setActiveTab('system')}
              >
                <BarChart3 className="h-3.5 w-3.5 inline mr-1.5" />
                System
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors relative ${
                  activeTab === 'queue' ? 'bg-section-accent text-white' : 'text-white/60 hover:text-white'
                }`}
                onClick={() => setActiveTab('queue')}
              >
                <Layers className="h-3.5 w-3.5 inline mr-1.5" />
                Warteschlange
                {queue.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {queue.length}
                  </span>
                )}
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'history' ? 'bg-section-accent text-white' : 'text-white/60 hover:text-white'
                }`}
                onClick={() => setActiveTab('history')}
              >
                <History className="h-3.5 w-3.5 inline mr-1.5" />
                Verlauf
              </button>
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

          {/* Content */}
          <div className="max-h-[450px] overflow-y-auto">
            
            {/* ACTIVITY TAB */}
            {activeTab === 'activity' && (
              <>
                {/* Quick Stats */}
                {system && (
                  <div className="grid grid-cols-4 gap-px bg-white/5 border-b border-white/10">
                    <div className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                        <Cpu className="h-3.5 w-3.5" />
                        <span className="text-xs">CPU</span>
                      </div>
                      <p className={`text-lg font-semibold ${system.cpu.load > 80 ? 'text-red-400' : system.cpu.load > 50 ? 'text-amber-400' : 'text-green-400'}`}>
                        {system.cpu.load}%
                      </p>
                    </div>
                    <div className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                        <MemoryStick className="h-3.5 w-3.5" />
                        <span className="text-xs">RAM</span>
                      </div>
                      <p className={`text-lg font-semibold ${system.memory.percentage > 80 ? 'text-red-400' : system.memory.percentage > 50 ? 'text-amber-400' : 'text-green-400'}`}>
                        {system.memory.percentage}%
                      </p>
                    </div>
                    <div className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                        <Monitor className="h-3.5 w-3.5" />
                        <span className="text-xs">Direct</span>
                      </div>
                      <p className="text-lg font-semibold text-green-400">
                        {sessions.filter(s => s.transcodeInfo?.videoDecision === 'direct').length}
                      </p>
                    </div>
                    <div className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                        <Cpu className="h-3.5 w-3.5" />
                        <span className="text-xs">Transcode</span>
                      </div>
                      <p className="text-lg font-semibold text-amber-400">
                        {sessions.filter(s => s.transcodeInfo?.videoDecision === 'transcode').length}
                      </p>
                    </div>
                  </div>
                )}

                {/* Active Sessions */}
                {sessions.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Keine aktiven Streams</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {sessions.map((session) => (
                      <div key={session.id} className="p-4 hover:bg-white/5 transition-colors">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                            {(() => {
                              const Icon = getDeviceIcon(session.device);
                              return <Icon className="h-5 w-5 text-white/70" />;
                            })()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-white truncate">{session.mediaTitle}</h4>
                              {(() => {
                                const Icon = getStateIcon(session.state);
                                const color = getStateColor(session.state);
                                return <Icon className={`h-3.5 w-3.5 ${color}`} />;
                              })()}
                            </div>
                            <p className="text-xs text-muted-foreground">{session.userName} • {session.device}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-mono text-white/80">
                              {formatDuration(session.position)} / {formatDuration(session.duration)}
                            </p>
                            <div className="w-20 h-1 bg-white/20 rounded-full mt-1 overflow-hidden">
                              <div className="h-full bg-section-accent" style={{ width: `${(session.position / session.duration) * 100}%` }} />
                            </div>
                          </div>
                        </div>

                        {session.transcodeInfo && (
                          <div className="space-y-1 pl-[52px] text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground w-12">Video</span>
                              <span className="text-white/60">{session.transcodeInfo.videoCodec}</span>
                              <span className="text-white/30">→</span>
                              {session.transcodeInfo.videoDecision === 'direct' ? (
                                <span className="text-green-400">Direct Stream</span>
                              ) : (
                                <span className="text-amber-400">Transcode {session.transcodeProgress !== undefined && `(${session.transcodeProgress}%)`}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground w-12">Audio</span>
                              <span className="text-white/60">{session.transcodeInfo.audioCodec}</span>
                              <span className="text-white/30">→</span>
                              <span className={session.transcodeInfo.audioDecision === 'direct' ? 'text-green-400' : 'text-amber-400'}>
                                {session.transcodeInfo.audioDecision === 'direct' ? 'Direct' : 'Transcode'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* SYSTEM TAB */}
            {activeTab === 'system' && detailedSystem && (
              <div className="p-4 space-y-4">
                {/* CPU */}
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-blue-400" />
                      <span className="font-medium text-sm">CPU</span>
                    </div>
                    <span className={`text-sm font-semibold ${detailedSystem.cpu.load > 80 ? 'text-red-400' : detailedSystem.cpu.load > 50 ? 'text-amber-400' : 'text-green-400'}`}>
                      {detailedSystem.cpu.load}% ({detailedSystem.cpu.cores} Cores)
                    </span>
                  </div>
                  <div className="h-8 flex items-end gap-0.5">
                    {detailedSystem.cpu.loadHistory.slice(-20).map((load, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-sm ${load > 80 ? 'bg-red-500/60' : load > 50 ? 'bg-amber-500/60' : 'bg-green-500/60'}`}
                        style={{ height: `${load}%` }}
                      />
                    ))}
                  </div>
                </div>

                {/* Memory */}
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <MemoryStick className="h-4 w-4 text-purple-400" />
                      <span className="font-medium text-sm">Arbeitsspeicher</span>
                    </div>
                    <span className="text-sm text-white/60">{detailedSystem.memory.used} / {detailedSystem.memory.total}</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${detailedSystem.memory.percentage > 80 ? 'bg-red-500' : detailedSystem.memory.percentage > 50 ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${detailedSystem.memory.percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-white/40 mt-1">{detailedSystem.memory.percentage}% belegt</p>
                </div>

                {/* Disk */}
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-cyan-400" />
                      <span className="font-medium text-sm">Speicherplatz</span>
                    </div>
                    <span className="text-sm text-white/60">{detailedSystem.disk.used} / {detailedSystem.disk.total}</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${detailedSystem.disk.percentage > 90 ? 'bg-red-500' : detailedSystem.disk.percentage > 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${detailedSystem.disk.percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-white/40 mt-1">{detailedSystem.disk.percentage}% belegt • {detailedSystem.disk.free} frei</p>
                </div>

                {/* Network */}
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Wifi className="h-4 w-4 text-green-400" />
                    <span className="font-medium text-sm">Netzwerk</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Download</p>
                      <p className="text-sm font-medium text-green-400">{detailedSystem.network.rxSec}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Upload</p>
                      <p className="text-sm font-medium text-blue-400">{detailedSystem.network.txSec}</p>
                    </div>
                  </div>
                </div>

                {/* Uptime */}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-white/10">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Server läuft seit: {detailedSystem.uptime}
                  </span>
                </div>
              </div>
            )}

            {/* QUEUE TAB */}
            {activeTab === 'queue' && (
              <div className="p-4">
                {queue.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <Layers className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Keine Transcoding-Aufgaben</p>
                    <p className="text-xs opacity-60 mt-1">Die Warteschlange ist leer</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {queue.map((item) => (
                      <div key={item.id} className="bg-white/5 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm text-white truncate">{item.mediaTitle}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            item.status === 'processing' ? 'bg-amber-500/20 text-amber-400' : 
                            item.status === 'pending' ? 'bg-blue-500/20 text-blue-400' :
                            item.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {item.status === 'processing' ? 'Verarbeitet' : 
                             item.status === 'pending' ? 'Wartet' :
                             item.status === 'completed' ? 'Fertig' : 'Fehler'}
                          </span>
                        </div>
                        {item.status === 'processing' && (
                          <div className="space-y-1">
                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-amber-500 rounded-full transition-all"
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                            <p className="text-xs text-white/40 text-right">{item.progress}%</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* HISTORY TAB */}
            {activeTab === 'history' && (
              <div className="divide-y divide-white/5">
                {history.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Kein Verlauf vorhanden</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div key={item.id} className="p-3 hover:bg-white/5 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <Monitor className="h-4 w-4 text-white/40 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm text-white truncate">{item.mediaTitle}</p>
                            <p className="text-xs text-muted-foreground">{item.userName} • {item.device}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            item.decision === 'direct' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                          }`}>
                            {item.decision === 'direct' ? 'Direct' : 'Transcode'}
                          </span>
                          <p className="text-xs text-white/40 mt-1">
                            {formatDuration(item.duration)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-white/10 bg-white/5 flex items-center justify-between text-xs text-muted-foreground">
            <span>Spherix Media Server</span>
            {system && <span>Online seit: {system.uptime}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default StatusDashboard;
