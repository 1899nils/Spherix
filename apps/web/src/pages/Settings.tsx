import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/uiStore';
import {
  Loader2,
  RefreshCw,
  Music2,
  Radio as RadioIcon,
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
} from 'lucide-react';

type Tab = 'general' | 'musik' | 'video' | 'audiobook';

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

const REGIONS = [
  'Alle',
  'Baden-Württemberg',
  'Bayern',
  'Berlin',
  'Brandenburg',
  'Bremen',
  'Hamburg',
  'Hessen',
  'Mecklenburg-Vorpommern',
  'Niedersachsen',
  'Nordrhein-Westfalen',
  'Rheinland-Pfalz',
  'Saarland',
  'Sachsen',
  'Sachsen-Anhalt',
  'Schleswig-Holstein',
  'Thüringen',
];

function StatusDot({ status }: { status: string }) {
  const color = status === 'ok' || status === 'ready' ? 'bg-green-500' : 'bg-red-500';
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

function ScanCard({
  icon,
  label,
  path,
  isPending,
  isSuccess,
  onScan,
}: {
  icon: React.ReactNode;
  label: string;
  path: string;
  isPending: boolean;
  isSuccess: boolean;
  onScan: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm">{label}</p>
            <p className="text-xs text-zinc-500 truncate">{path}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onScan} disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          {isPending ? 'Scannt…' : 'Scannen'}
        </Button>
      </div>
      {isSuccess && (
        <p className="text-xs text-green-400 flex items-center gap-1 px-1">
          <CheckCircle2 className="h-3.5 w-3.5" /> Scan gestartet
        </p>
      )}
    </div>
  );
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('general');

  const radioRegion = useUIStore((state) => state.radioRegion);
  const setRadioRegion = useUIStore((state) => state.setRadioRegion);

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
    mutationFn: (data: { publicUrl: string }) => api.put('/settings', data),
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

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general',   label: 'Grundeinstellungen' },
    { id: 'musik',     label: 'Musik' },
    { id: 'video',     label: 'Video' },
    { id: 'audiobook', label: 'Hörbücher' },
  ];

  return (
    <div className="max-w-2xl mx-auto text-white space-y-6">

      {/* ─── Tab Navigation ──────────────────────────────────────────────────── */}

      <div className="flex border-b border-white/10">
        {tabs.map((tab) => (
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

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Musik-Mediathek</h2>
            <ScanCard
              icon={<Music className="h-4 w-4 text-zinc-400" />}
              label="Musik"
              path={settingsData?.data?.paths?.music ?? '/music'}
              isPending={scanMusic.isPending}
              isSuccess={scanMusic.isSuccess}
              onScan={() => scanMusic.mutate()}
            />
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Radio</h2>
            <div className="rounded-xl border border-white/5 p-6 bg-white/5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 bg-pink-500/10 rounded-xl flex items-center justify-center shrink-0">
                  <RadioIcon className="h-6 w-6 text-pink-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white">Bevorzugte Region</p>
                  <p className="text-sm text-zinc-400">Wähle, welche regionalen Sender standardmäßig angezeigt werden.</p>
                </div>
                <select
                  value={radioRegion}
                  onChange={(e) => setRadioRegion(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all outline-none shrink-0"
                >
                  {REGIONS.map((region) => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ─── Video ───────────────────────────────────────────────────────────── */}

      {activeTab === 'video' && (
        <div className="space-y-6">

          <section className="space-y-4">
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

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Video-Mediathek</h2>
            <ScanCard
              icon={<Clapperboard className="h-4 w-4 text-zinc-400" />}
              label="Filme & Serien"
              path={settingsData?.data?.paths?.video ?? '/videos'}
              isPending={scanVideo.isPending}
              isSuccess={scanVideo.isSuccess}
              onScan={() => scanVideo.mutate()}
            />
          </section>
        </div>
      )}

      {/* ─── Hörbücher ───────────────────────────────────────────────────────── */}

      {activeTab === 'audiobook' && (
        <div className="space-y-6">
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Hörbücher-Mediathek</h2>
            <ScanCard
              icon={<BookOpen className="h-4 w-4 text-zinc-400" />}
              label="Hörbücher"
              path={settingsData?.data?.paths?.audiobook ?? '/audiobooks'}
              isPending={scanAudiobooks.isPending}
              isSuccess={scanAudiobooks.isSuccess}
              onScan={() => scanAudiobooks.mutate()}
            />
          </section>
        </div>
      )}
    </div>
  );
}
