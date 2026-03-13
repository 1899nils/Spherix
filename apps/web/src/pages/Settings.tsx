import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  RefreshCw,
  Music2,
  Globe,
  Server,
  Database,
  HardDrive,
  Music,
  CheckCircle2,
  AlertCircle,
  Save,
  Clapperboard,
  BookOpen,
  FolderOpen,
  UserPlus,
  Trash2,
  Shield,
  Users,
  Pencil,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

type Tab = 'general' | 'musik' | 'video' | 'audiobook' | 'users';

interface ApiData<T> {
  data: T;
}

interface ServerSettingsData {
  publicUrl: string;
  server: {
    port: number;
    nodeEnv: string;
    databaseStatus: string;
    redisStatus: string;
  };
  paths: {
    music: string;
    video: string;
    audiobook: string;
  };
  stats: {
    albums: number;
    tracks: number;
    artists: number;
  };
}


function StatusDot({ status }: { status: string }) {
  const color = status === 'ok' || status === 'ready' ? 'bg-green-500' : 'bg-red-500';
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

function ScanCard({
  icon,
  label,
  path,
  onPathSave,
  isPending,
  isSuccess,
  onScan,
}: {
  icon: React.ReactNode;
  label: string;
  path: string;
  onPathSave: (newPath: string) => Promise<unknown>;
  isPending: boolean;
  isSuccess: boolean;
  onScan: () => void;
}) {
  const [localPath, setLocalPath] = useState(path);
  const [isSavingPath, setIsSavingPath] = useState(false);
  const [pathSaved, setPathSaved] = useState(false);
  const pathChanged = localPath !== path;

  useEffect(() => { setLocalPath(path); }, [path]);

  const handleSavePath = async () => {
    setIsSavingPath(true);
    try {
      await onPathSave(localPath);
      setPathSaved(true);
      setTimeout(() => setPathSaved(false), 2000);
    } finally {
      setIsSavingPath(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <p className="font-medium text-sm">{label}</p>
      </div>

      {/* Editable path */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs text-zinc-400 uppercase tracking-wide font-medium">
          <FolderOpen className="h-3 w-3" />
          Pfad im Container
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            placeholder="/music"
            className="flex-1 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <Button
            size="sm"
            variant={pathChanged ? 'default' : 'outline'}
            onClick={handleSavePath}
            disabled={isSavingPath || !pathChanged}
            title="Pfad speichern"
          >
            {isSavingPath
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : pathSaved
                ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                : <Save className="h-3.5 w-3.5" />
            }
          </Button>
        </div>
        <p className="text-xs text-zinc-600">
          Host-Verzeichnis → Container-Pfad: in docker-compose.yml konfigurieren
        </p>
      </div>

      {/* Scan action */}
      <div className="flex items-center justify-between pt-1 border-t border-white/5">
        <div>
          {isSuccess && (
            <p className="text-xs text-green-400 flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Scan gestartet
            </p>
          )}
          {pathChanged && (
            <p className="text-xs text-amber-400">Pfad nicht gespeichert</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onScan} disabled={isPending || pathChanged}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          {isPending ? 'Scannt…' : 'Scannen'}
        </Button>
      </div>
    </div>
  );
}

interface AuthUser {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
}

export function Settings() {
  const currentUser = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<Tab>(currentUser?.isAdmin ? 'general' : 'musik');

  // ─── Server Settings ────────────────────────────────────────────────────────

  const { data: settingsData, refetch: refetchSettings } = useQuery({
    queryKey: ['server-settings'],
    queryFn: () => api.get<ApiData<ServerSettingsData>>('/settings'),
  });

  const [localPublicUrl, setLocalPublicUrl] = useState('');
  const [settingsFeedback, setSettingsFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (settingsData?.data) {
      setLocalPublicUrl(settingsData.data.publicUrl || '');
    }
  }, [settingsData]);

  const saveSettings = useMutation({
    mutationFn: (data: { publicUrl?: string; musicPath?: string; videoPath?: string; audiobookPath?: string }) =>
      api.put('/settings', data),
    onSuccess: () => {
      setSettingsFeedback({ type: 'success', message: 'Einstellungen gespeichert!' });
      refetchSettings();
      setTimeout(() => setSettingsFeedback(null), 3000);
    },
    onError: (err: Error) => {
      setSettingsFeedback({ type: 'error', message: `Fehler: ${err.message}` });
    },
  });

  const serverInfo = settingsData?.data?.server;
  const stats = settingsData?.data?.stats;

  // ─── Last.fm ────────────────────────────────────────────────────────────────

  const { data: lastfmData, refetch: refetchLastfm } = useQuery({
    queryKey: ['lastfm-status'],
    queryFn: () =>
      api.get<ApiData<{ connected: boolean; username: string | null; apiKey: string | null; apiSecret: string | null }>>('/lastfm/status'),
  });

  const [localApiKey, setLocalApiKey] = useState('');
  const [localApiSecret, setLocalApiSecret] = useState('');
  const [lastfmFeedback, setLastfmFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lastfmParam = params.get('lastfm');
    if (lastfmParam === 'connected') {
      setActiveTab('musik');
      setLastfmFeedback({ type: 'success', message: 'Last.fm erfolgreich verbunden!' });
      refetchLastfm();
      setTimeout(() => setLastfmFeedback(null), 5000);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (lastfmParam === 'error') {
      setActiveTab('musik');
      setLastfmFeedback({ type: 'error', message: 'Last.fm Verbindung fehlgeschlagen. Bitte versuche es erneut.' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (lastfmData?.data) {
      setLocalApiKey(lastfmData.data.apiKey || '');
      setLocalApiSecret(lastfmData.data.apiSecret || '');
    }
  }, [lastfmData]);

  const saveLastfmConfig = useMutation({
    mutationFn: (data: { apiKey: string; apiSecret: string }) => api.post('/lastfm/config', data),
    onSuccess: () => {
      setLastfmFeedback({ type: 'success', message: 'Konfiguration erfolgreich gespeichert!' });
      refetchLastfm();
      setTimeout(() => setLastfmFeedback(null), 3000);
    },
    onError: (err: Error) => {
      setLastfmFeedback({ type: 'error', message: `Fehler: ${err.message}` });
    },
  });

  const testLastfmConfig = useMutation({
    mutationFn: (data: { apiKey: string; apiSecret: string }) => api.post('/lastfm/test-config', data),
    onSuccess: () => {
      setLastfmFeedback({ type: 'success', message: 'API-Daten sind gültig!' });
      setTimeout(() => setLastfmFeedback(null), 3000);
    },
    onError: (err: Error) => {
      setLastfmFeedback({ type: 'error', message: `Test fehlgeschlagen: ${err.message}` });
    },
  });

  const connectLastfm = useMutation({
    mutationFn: () => api.get<ApiData<{ url: string }>>('/lastfm/auth-url'),
    onSuccess: (res) => {
      window.location.href = res.data.url;
    },
    onError: (err: Error) => {
      setLastfmFeedback({ type: 'error', message: `Verbindung fehlgeschlagen: ${err.message}. Bitte speichere zuerst API Key und Secret.` });
    },
  });

  const disconnectLastfm = useMutation({
    mutationFn: () => api.post('/lastfm/disconnect', {}),
    onSuccess: () => refetchLastfm(),
  });

  // ─── TMDb ────────────────────────────────────────────────────────────────────

  const { data: tmdbData, refetch: refetchTmdb } = useQuery({
    queryKey: ['tmdb-status'],
    queryFn: () => api.get<ApiData<{ configured: boolean; apiKey: string | null }>>('/tmdb/status'),
  });

  const [localTmdbApiKey, setLocalTmdbApiKey] = useState('');
  const [tmdbFeedback, setTmdbFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (tmdbData?.data) {
      setLocalTmdbApiKey(tmdbData.data.apiKey || '');
    }
  }, [tmdbData]);

  const saveTmdbConfig = useMutation({
    mutationFn: (data: { apiKey: string }) => api.post('/tmdb/config', data),
    onSuccess: () => {
      setTmdbFeedback({ type: 'success', message: 'TMDb API-Key gespeichert!' });
      refetchTmdb();
      setTimeout(() => setTmdbFeedback(null), 3000);
    },
    onError: (err: Error) => {
      setTmdbFeedback({ type: 'error', message: `Fehler: ${err.message}` });
    },
  });

  const testTmdbConfig = useMutation({
    mutationFn: (data: { apiKey: string }) => api.post('/tmdb/test-config', data),
    onSuccess: () => {
      setTmdbFeedback({ type: 'success', message: 'API-Key ist gültig!' });
      setTimeout(() => setTmdbFeedback(null), 3000);
    },
    onError: (err: Error) => {
      setTmdbFeedback({ type: 'error', message: `Test fehlgeschlagen: ${err.message}` });
    },
  });

  // ─── YouTube ─────────────────────────────────────────────────────────────────

  const { data: youtubeData, refetch: refetchYoutube } = useQuery({
    queryKey: ['youtube-status'],
    queryFn: () => api.get<ApiData<{ configured: boolean; apiKey: string | null }>>('/youtube/status'),
  });

  const [localYoutubeApiKey, setLocalYoutubeApiKey] = useState('');
  const [youtubeFeedback, setYoutubeFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (youtubeData?.data) {
      setLocalYoutubeApiKey(''); // Don't show actual key, just placeholder
    }
  }, [youtubeData]);

  const saveYoutubeConfig = useMutation({
    mutationFn: (data: { apiKey: string }) => api.post('/youtube/config', data),
    onSuccess: () => {
      setYoutubeFeedback({ type: 'success', message: 'YouTube API-Key gespeichert!' });
      refetchYoutube();
      setLocalYoutubeApiKey('');
      setTimeout(() => setYoutubeFeedback(null), 3000);
    },
    onError: (err: Error) => {
      setYoutubeFeedback({ type: 'error', message: `Fehler: ${err.message}` });
    },
  });

  const testYoutubeConfig = useMutation({
    mutationFn: (data: { apiKey: string }) => api.post('/youtube/test-config', data),
    onSuccess: () => {
      setYoutubeFeedback({ type: 'success', message: 'API-Key ist gültig!' });
      setTimeout(() => setYoutubeFeedback(null), 3000);
    },
    onError: (err: Error) => {
      setYoutubeFeedback({ type: 'error', message: `Test fehlgeschlagen: ${err.message}` });
    },
  });

  const disconnectYoutube = useMutation({
    mutationFn: () => api.delete('/youtube/config'),
    onSuccess: () => {
      refetchYoutube();
      setYoutubeFeedback({ type: 'success', message: 'YouTube API-Key entfernt!' });
      setTimeout(() => setYoutubeFeedback(null), 3000);
    },
    onError: (err: Error) => {
      setYoutubeFeedback({ type: 'error', message: `Fehler: ${err.message}` });
    },
  });

  // ─── PodcastIndex ────────────────────────────────────────────────────────────

  const { data: piData, refetch: refetchPi } = useQuery({
    queryKey: ['podcastindex-status'],
    queryFn: () => api.get<ApiData<{ configured: boolean; apiKey: string | null; secretConfigured: boolean }>>('/podcastindex/status'),
  });
  const [localPiApiKey, setLocalPiApiKey] = useState('');
  const [localPiApiSecret, setLocalPiApiSecret] = useState('');
  const [piFeedback, setPiFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (piData?.data) {
      setLocalPiApiKey(piData.data.apiKey || '');
      setLocalPiApiSecret(''); // never prefill secret — show placeholder if already saved
    }
  }, [piData]);

  const savePiConfig = useMutation({
    mutationFn: (data: { apiKey: string; apiSecret: string }) => api.post('/podcastindex/config', data),
    onSuccess: () => {
      refetchPi();
      setPiFeedback({ type: 'success', message: 'PodcastIndex API-Keys gespeichert!' });
      setTimeout(() => setPiFeedback(null), 3000);
    },
    onError: (err: Error) => {
      setPiFeedback({ type: 'error', message: `Fehler: ${err.message}` });
    },
  });

  const testPiConfig = useMutation({
    mutationFn: () => api.post('/podcastindex/test', {}),
    onSuccess: () => {
      setPiFeedback({ type: 'success', message: 'Verbindung erfolgreich — API-Keys funktionieren!' });
      setTimeout(() => setPiFeedback(null), 4000);
    },
    onError: (err: Error) => {
      setPiFeedback({ type: 'error', message: `Verbindungstest fehlgeschlagen: ${err.message}` });
    },
  });

  // ─── Scanner ─────────────────────────────────────────────────────────────────

  const scanMusic = useMutation({
    mutationFn: () => api.post<ApiData<{ jobId: string }>>('/libraries/scan', {}),
  });
  const scanVideo = useMutation({
    mutationFn: () => api.post<ApiData<{ jobId: string }>>('/video/scan', {}),
  });
  const scanAudiobooks = useMutation({
    mutationFn: () => api.post<ApiData<{ jobId: string }>>('/audiobooks/scan', {}),
  });

  const lastfm = lastfmData?.data;

  // ─── Tab bar ─────────────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; adminOnly?: boolean }[] = [
    { id: 'general',   label: 'Grundeinstellungen', adminOnly: true },
    { id: 'musik',     label: 'Musik' },
    { id: 'video',     label: 'Video' },
    { id: 'audiobook', label: 'Hörbücher' },
    { id: 'users',     label: 'Benutzer', adminOnly: true },
  ];

  return (
    <div className="max-w-2xl mx-auto text-white space-y-6">

      {/* ─── Tab Navigation ──────────────────────────────────────────────────── */}

      <div className="flex border-b border-white/10">
        {tabs.filter((t) => !t.adminOnly || currentUser?.isAdmin).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'text-white border-blue-500'
                : 'text-zinc-400 border-transparent hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Grundeinstellungen ──────────────────────────────────────────────── */}

      {activeTab === 'general' && (
        <div className="space-y-6">

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Server Konfiguration</h2>
            <div className="rounded-xl border border-white/5 p-6 bg-white/5 space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-400 font-medium flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5" />
                  Öffentliche URL (Public URL)
                </label>
                <input
                  type="url"
                  value={localPublicUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalPublicUrl(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="z.B. http://192.168.1.100:1234"
                />
                <p className="text-xs text-zinc-500">
                  Die URL unter der Spherix erreichbar ist. Wird für OAuth-Callbacks (z.B. Last.fm) benötigt.
                </p>
              </div>

              {settingsFeedback && (
                <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                  settingsFeedback.type === 'success'
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {settingsFeedback.type === 'success'
                    ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                    : <AlertCircle className="h-4 w-4 shrink-0" />}
                  {settingsFeedback.message}
                </div>
              )}

              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
                onClick={() => saveSettings.mutate({ publicUrl: localPublicUrl })}
                disabled={saveSettings.isPending}
              >
                {saveSettings.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  : <Save className="h-4 w-4 mr-2" />}
                Speichern
              </Button>
            </div>

            {serverInfo && (
              <div className="rounded-xl border border-white/5 p-6 bg-white/5 space-y-3">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">Server Status</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20">
                    <Server className="h-4 w-4 text-zinc-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-500">Umgebung</p>
                      <p className="text-sm font-medium truncate">{serverInfo.nodeEnv} · Port {serverInfo.port}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20">
                    <Database className="h-4 w-4 text-zinc-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-500">Datenbank</p>
                      <p className="text-sm font-medium flex items-center gap-2">
                        <StatusDot status={serverInfo.databaseStatus} />
                        {serverInfo.databaseStatus === 'ok' ? 'Verbunden' : 'Fehler'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20">
                    <HardDrive className="h-4 w-4 text-zinc-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-500">Redis Cache</p>
                      <p className="text-sm font-medium flex items-center gap-2">
                        <StatusDot status={serverInfo.redisStatus} />
                        {serverInfo.redisStatus === 'ok' ? 'Verbunden' : 'Fehler'}
                      </p>
                    </div>
                  </div>
                  {stats && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-black/20">
                      <Music className="h-4 w-4 text-zinc-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-zinc-500">Musik-Bibliothek</p>
                        <p className="text-sm font-medium">
                          {stats.tracks.toLocaleString('de-DE')} Titel · {stats.albums.toLocaleString('de-DE')} Alben
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Darstellung</h2>
            <div className="rounded-xl border border-white/5 p-6 bg-white/5">
              <p className="text-sm text-zinc-400">Das dunkle Theme ist standardmäßig aktiv.</p>
            </div>
          </section>
        </div>
      )}

      {/* ─── Musik ───────────────────────────────────────────────────────────── */}

      {activeTab === 'musik' && (
        <div className="space-y-6">

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Last.fm Scrobbling</h2>
            <div className="rounded-xl border border-white/5 p-6 bg-white/5 space-y-4">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">API Konfiguration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400 font-medium">API Key</label>
                  <input
                    type="password"
                    value={localApiKey}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalApiKey(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                    placeholder="Last.fm API Key"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-400 font-medium">API Secret</label>
                  <input
                    type="password"
                    value={localApiSecret}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalApiSecret(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                    placeholder="Last.fm API Secret"
                  />
                </div>
              </div>

              {lastfmFeedback && (
                <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                  lastfmFeedback.type === 'success'
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {lastfmFeedback.type === 'success'
                    ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                    : <AlertCircle className="h-4 w-4 shrink-0" />}
                  {lastfmFeedback.message}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
                  onClick={() => saveLastfmConfig.mutate({ apiKey: localApiKey, apiSecret: localApiSecret })}
                  disabled={saveLastfmConfig.isPending || !localApiKey || !localApiSecret}
                >
                  {saveLastfmConfig.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Konfiguration speichern
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testLastfmConfig.mutate({ apiKey: localApiKey, apiSecret: localApiSecret })}
                  disabled={testLastfmConfig.isPending || !localApiKey || !localApiSecret}
                >
                  {testLastfmConfig.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  API testen
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-white/5 p-6 bg-white/5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 bg-red-500/10 rounded-xl flex items-center justify-center shrink-0">
                  <Music2 className="h-6 w-6 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white">Last.fm Account</p>
                  <p className="text-sm text-zinc-400">
                    {lastfm?.connected
                      ? `Verbunden als ${lastfm.username}`
                      : 'Verbinde deinen Account, um deine Musik zu scrobbeln.'}
                  </p>
                </div>
                {lastfm?.connected ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnectLastfm.mutate()}
                    disabled={disconnectLastfm.isPending}
                  >
                    Trennen
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="bg-red-600 hover:bg-red-500 text-white border-none"
                    onClick={() => connectLastfm.mutate()}
                    disabled={connectLastfm.isPending}
                  >
                    {connectLastfm.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Verbinden
                  </Button>
                )}
              </div>
            </div>
          </section>

          {currentUser?.isAdmin && (<section className="space-y-4">
            <h2 className="text-lg font-semibold">YouTube Musikvideos</h2>
            <div className="rounded-xl border border-white/5 p-6 bg-white/5 space-y-4">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 bg-red-600/10 rounded-xl flex items-center justify-center shrink-0">
                  <svg className="h-6 w-6 text-red-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white">Musikvideo-Suche</p>
                  <p className="text-sm text-zinc-400">
                    {youtubeData?.data?.configured
                      ? 'API-Key konfiguriert — Musikvideos werden automatisch gesucht.'
                      : 'Hinterlege deinen YouTube API-Key, um Musikvideos für Songs zu finden.'}
                  </p>
                </div>
                {youtubeData?.data?.configured && (
                  <span className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-3 py-1 shrink-0">
                    Konfiguriert ✓
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs text-zinc-400 font-medium">API-Key</label>
                <input
                  type="password"
                  value={localYoutubeApiKey}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalYoutubeApiKey(e.target.value)}
                  placeholder={youtubeData?.data?.configured ? '••••••••••••••••' : 'YouTube Data API v3 Key'}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
                <p className="text-xs text-zinc-500">
                  Erstelle einen API-Key in der <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google Cloud Console</a> und aktiviere die YouTube Data API v3.
                </p>
              </div>

              {youtubeFeedback && (
                <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                  youtubeFeedback.type === 'success'
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {youtubeFeedback.type === 'success'
                    ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                    : <AlertCircle className="h-4 w-4 shrink-0" />}
                  {youtubeFeedback.message}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
                  onClick={() => saveYoutubeConfig.mutate({ apiKey: localYoutubeApiKey })}
                  disabled={saveYoutubeConfig.isPending || !localYoutubeApiKey}
                >
                  {saveYoutubeConfig.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Speichern
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testYoutubeConfig.mutate({ apiKey: localYoutubeApiKey })}
                  disabled={testYoutubeConfig.isPending || !localYoutubeApiKey}
                >
                  {testYoutubeConfig.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Verbindung testen
                </Button>
                {youtubeData?.data?.configured && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => disconnectYoutube.mutate()}
                    disabled={disconnectYoutube.isPending}
                    className="text-red-400 hover:text-red-300"
                  >
                    {disconnectYoutube.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    Entfernen
                  </Button>
                )}
              </div>
            </div>
          </section>
          )}

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Podcast-Suche (PodcastIndex.org)</h2>
            <div className="rounded-xl border border-white/5 p-6 bg-white/5 space-y-4">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 bg-blue-600/10 rounded-xl flex items-center justify-center shrink-0">
                  <svg className="h-6 w-6 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white">PodcastIndex API</p>
                  <p className="text-sm text-zinc-400">
                    {piData?.data?.configured
                      ? 'API-Keys konfiguriert — Podcast-Suche ist aktiv.'
                      : 'Hinterlege deinen PodcastIndex API-Key und Secret für die Podcast-Suche.'}
                  </p>
                </div>
                {piData?.data?.configured && (
                  <span className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-3 py-1 shrink-0">
                    Konfiguriert ✓
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 font-medium">API Key</label>
                  <input
                    type="text"
                    value={localPiApiKey}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalPiApiKey(e.target.value)}
                    placeholder="API Key"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400 font-medium">
                    API Secret
                    {piData?.data?.secretConfigured && !localPiApiSecret && (
                      <span className="ml-2 text-green-400/70">gespeichert</span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={localPiApiSecret}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalPiApiSecret(e.target.value)}
                    placeholder={piData?.data?.secretConfigured ? '••••••••••••••••' : 'API Secret'}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-500">
                Kostenlosen Account und API-Keys erstellen unter <a href="https://api.podcastindex.org" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">api.podcastindex.org</a>.
                {piData?.data?.secretConfigured && ' Das Secret bleibt gespeichert wenn das Feld leer gelassen wird.'}
              </p>

              {piFeedback && (
                <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                  piFeedback.type === 'success'
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {piFeedback.type === 'success'
                    ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                    : <AlertCircle className="h-4 w-4 shrink-0" />}
                  {piFeedback.message}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
                  onClick={() => savePiConfig.mutate({ apiKey: localPiApiKey, apiSecret: localPiApiSecret })}
                  disabled={savePiConfig.isPending || !localPiApiKey || (!localPiApiSecret && !piData?.data?.secretConfigured)}
                >
                  {savePiConfig.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Speichern
                </Button>
                {piData?.data?.configured && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testPiConfig.mutate()}
                    disabled={testPiConfig.isPending}
                  >
                    {testPiConfig.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    Verbindung testen
                  </Button>
                )}
              </div>
            </div>
          </section>

          {currentUser?.isAdmin && (<section className="space-y-4">
            <h2 className="text-lg font-semibold">Musik-Mediathek</h2>
            <ScanCard
              icon={<Music className="h-4 w-4 text-zinc-400" />}
              label="Musik"
              path={settingsData?.data?.paths?.music ?? '/music'}
              onPathSave={(p) => saveSettings.mutateAsync({ musicPath: p })}
              isPending={scanMusic.isPending}
              isSuccess={scanMusic.isSuccess}
              onScan={() => scanMusic.mutate()}
            />
          </section>
          )}

        </div>
      )}

      {/* ─── Video ───────────────────────────────────────────────────────────── */}

      {activeTab === 'video' && (
        <div className="space-y-6">

          {currentUser?.isAdmin && (<section className="space-y-4">
            <h2 className="text-lg font-semibold">The Movie Database (TMDb)</h2>
            <div className="rounded-xl border border-white/5 p-6 bg-white/5 space-y-4">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 bg-blue-500/10 rounded-xl flex items-center justify-center shrink-0">
                  <Clapperboard className="h-6 w-6 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white">Metadaten für Filme &amp; Serien</p>
                  <p className="text-sm text-zinc-400">
                    {tmdbData?.data?.configured
                      ? 'API-Key konfiguriert — Metadaten werden beim nächsten Scan abgerufen.'
                      : 'Hinterlege deinen API-Key, um Filmbeschreibungen, Poster und Bewertungen automatisch zu laden.'}
                  </p>
                </div>
                {tmdbData?.data?.configured && (
                  <span className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-3 py-1 shrink-0">
                    Konfiguriert ✓
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs text-zinc-400 font-medium">API-Key</label>
                <input
                  type="password"
                  value={localTmdbApiKey}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLocalTmdbApiKey(e.target.value)}
                  placeholder="TMDb API-Key"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              {tmdbFeedback && (
                <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                  tmdbFeedback.type === 'success'
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {tmdbFeedback.type === 'success'
                    ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                    : <AlertCircle className="h-4 w-4 shrink-0" />}
                  {tmdbFeedback.message}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
                  onClick={() => saveTmdbConfig.mutate({ apiKey: localTmdbApiKey })}
                  disabled={saveTmdbConfig.isPending || !localTmdbApiKey}
                >
                  {saveTmdbConfig.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Speichern
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testTmdbConfig.mutate({ apiKey: localTmdbApiKey })}
                  disabled={testTmdbConfig.isPending || !localTmdbApiKey}
                >
                  {testTmdbConfig.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Verbindung testen
                </Button>
              </div>
            </div>
          </section>
          )}

          {currentUser?.isAdmin && (<section className="space-y-4">
            <h2 className="text-lg font-semibold">Video-Mediathek</h2>
            <ScanCard
              icon={<Clapperboard className="h-4 w-4 text-zinc-400" />}
              label="Filme & Serien"
              path={settingsData?.data?.paths?.video ?? '/videos'}
              onPathSave={(p) => saveSettings.mutateAsync({ videoPath: p })}
              isPending={scanVideo.isPending}
              isSuccess={scanVideo.isSuccess}
              onScan={() => scanVideo.mutate()}
            />
          </section>
          )}
        </div>
      )}

      {/* ─── Hörbücher ───────────────────────────────────────────────────────── */}

      {activeTab === 'audiobook' && (
        <div className="space-y-6">
          {currentUser?.isAdmin && (<section className="space-y-4">
            <h2 className="text-lg font-semibold">Hörbücher-Mediathek</h2>
            <ScanCard
              icon={<BookOpen className="h-4 w-4 text-zinc-400" />}
              label="Hörbücher"
              path={settingsData?.data?.paths?.audiobook ?? '/audiobooks'}
              onPathSave={(p) => saveSettings.mutateAsync({ audiobookPath: p })}
              isPending={scanAudiobooks.isPending}
              isSuccess={scanAudiobooks.isSuccess}
              onScan={() => scanAudiobooks.mutate()}
            />
          </section>
          )}
        </div>
      )}

      {/* ─── Benutzer (Admin only) ────────────────────────────────────────────── */}

      {activeTab === 'users' && currentUser?.isAdmin && (
        <UsersTab currentUserId={currentUser.id} />
      )}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const queryClient = useQueryClient();

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['auth-users'],
    queryFn: () => api.get<{ data: AuthUser[] }>('/auth/users'),
  });

  const [showForm, setShowForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [formError, setFormError] = useState('');

  const [editUser, setEditUser] = useState<AuthUser | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [editError, setEditError] = useState('');

  const createUser = useMutation({
    mutationFn: (data: { username: string; email: string; password: string; isAdmin: boolean }) =>
      api.post('/auth/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-users'] });
      setShowForm(false);
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewIsAdmin(false);
      setFormError('');
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth-users'] }),
  });

  const updateUser = useMutation({
    mutationFn: (data: { id: string; username: string; email: string; isAdmin: boolean; password?: string }) =>
      api.patch(`/auth/users/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-users'] });
      setEditUser(null);
      setEditPassword('');
      setEditError('');
    },
    onError: (err: Error) => setEditError(err.message),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!newUsername || !newPassword) { setFormError('Benutzername und Passwort erforderlich'); return; }
    createUser.mutate({ username: newUsername, email: newEmail, password: newPassword, isAdmin: newIsAdmin });
  };

  const users = usersData?.data ?? [];

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Benutzerverwaltung</h2>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Neuer Benutzer
          </Button>
        </div>

        {/* Create user form */}
        {showForm && (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Neuen Benutzer anlegen</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Benutzername *</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="nils"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">E-Mail (optional)</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="nils@beispiel.de"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">Passwort *</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mindestens 4 Zeichen"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newIsAdmin}
                  onChange={(e) => setNewIsAdmin(e.target.checked)}
                  className="rounded border-white/20 bg-black/40 text-blue-500"
                />
                <span className="text-sm text-zinc-300">Admin-Rechte gewähren</span>
              </label>
              {formError && <p className="text-xs text-red-400">{formError}</p>}
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                  Abbrechen
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                  disabled={createUser.isPending}
                >
                  {createUser.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <UserPlus className="h-4 w-4 mr-1" />}
                  Anlegen
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* User list */}
        <div className="rounded-xl border border-white/5 bg-white/5 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-sm text-zinc-500">
              Keine Benutzer gefunden
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <Users className="h-4 w-4 text-zinc-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white truncate">{user.username}</p>
                      {user.isAdmin && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-400/80 bg-amber-400/10 rounded px-1.5 py-0.5 shrink-0">
                          <Shield className="h-2.5 w-2.5" /> Admin
                        </span>
                      )}
                      {user.id === currentUserId && (
                        <span className="text-[10px] text-blue-400/70 bg-blue-400/10 rounded px-1.5 py-0.5 shrink-0">
                          Ich
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                  </div>
                  <p className="text-xs text-zinc-600 shrink-0 hidden sm:block">
                    {new Date(user.createdAt).toLocaleDateString('de-DE')}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 shrink-0"
                    onClick={() => {
                      setEditUser(user);
                      setEditUsername(user.username);
                      setEditEmail(user.email ?? '');
                      setEditIsAdmin(user.isAdmin);
                      setEditPassword('');
                      setEditError('');
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {user.id !== currentUserId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 shrink-0"
                      disabled={deleteUser.isPending}
                      onClick={() => {
                        if (confirm(`Benutzer "${user.username}" wirklich löschen?`)) {
                          deleteUser.mutate(user.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Edit user modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditUser(null)} />
          <div className="relative bg-zinc-900 border border-white/10 rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white">
              Benutzer bearbeiten: <span className="text-blue-400">{editUser.username}</span>
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setEditError('');
                if (!editUsername) { setEditError('Benutzername erforderlich'); return; }
                updateUser.mutate({
                  id: editUser.id,
                  username: editUsername,
                  email: editEmail,
                  isAdmin: editIsAdmin,
                  password: editPassword || undefined,
                });
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">Benutzername *</label>
                  <input
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-400">E-Mail</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">Neues Passwort (leer = unverändert)</label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Mindestens 4 Zeichen"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editIsAdmin}
                  onChange={(e) => setEditIsAdmin(e.target.checked)}
                  className="rounded border-white/20 bg-black/40 text-blue-500"
                />
                <span className="text-sm text-zinc-300">Admin-Rechte</span>
              </label>
              {editError && <p className="text-xs text-red-400">{editError}</p>}
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditUser(null)}>
                  Abbrechen
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                  disabled={updateUser.isPending}
                >
                  {updateUser.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Pencil className="h-4 w-4 mr-1" />}
                  Speichern
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
