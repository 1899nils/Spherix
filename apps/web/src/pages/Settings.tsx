import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import type { Library } from '@musicserver/shared';
import { useUIStore } from '@/stores/uiStore';
import { FolderOpen, Loader2, RefreshCw, Music2, Radio as RadioIcon } from 'lucide-react';

interface ApiData<T> {
  data: T;
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
  'Thüringen'
];

export function Settings() {
  const [newLibName, setNewLibName] = useState('');
  const [newLibPath, setNewLibPath] = useState('');
  const radioRegion = useUIStore((state) => state.radioRegion);
  const setRadioRegion = useUIStore((state) => state.setRadioRegion);

  const { data: librariesData, refetch } = useQuery({
    queryKey: ['libraries'],
    queryFn: () => api.get<ApiData<Library[]>>('/libraries'),
  });

  const { data: lastfmData, refetch: refetchLastfm } = useQuery({
    queryKey: ['lastfm-status'],
    queryFn: () => api.get<ApiData<{ connected: boolean; username: string | null; apiKey: string | null; apiSecret: string | null }>>('/lastfm/status'),
  });

  const [localApiKey, setLocalApiKey] = useState('');
  const [localApiSecret, setLocalApiSecret] = useState('');
  const [lastfmFeedback, setLastfmFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    if (lastfmData?.data) {
      setLocalApiKey(lastfmData.data.apiKey || '');
      setLocalApiSecret(lastfmData.data.apiSecret || '');
    }
  }, [lastfmData]);

  const saveLastfmConfig = useMutation({
    mutationFn: (data: { apiKey: string; apiSecret: string }) => 
      api.post('/lastfm/config', data),
    onSuccess: () => {
      setLastfmFeedback({ type: 'success', message: 'Konfiguration erfolgreich gespeichert!' });
      refetchLastfm();
      setTimeout(() => setLastfmFeedback(null), 3000);
    },
    onError: (err: Error) => {
      setLastfmFeedback({ type: 'error', message: `Fehler: ${err.message}` });
    }
  });

  const testLastfmConfig = useMutation({
    mutationFn: (data: { apiKey: string; apiSecret: string }) => 
      api.post('/lastfm/test-config', data),
    onSuccess: () => {
      setLastfmFeedback({ type: 'success', message: 'API-Daten sind gültig!' });
      setTimeout(() => setLastfmFeedback(null), 3000);
    },
    onError: (err: Error) => {
      setLastfmFeedback({ type: 'error', message: `Test fehlgeschlagen: ${err.message}` });
    }
  });

  const connectLastfm = useMutation({
    mutationFn: () => api.get<ApiData<{ url: string }>>('/lastfm/auth-url'),
    onSuccess: (res) => {
      window.location.href = res.data.url;
    },
  });

  const disconnectLastfm = useMutation({
    mutationFn: () => api.post('/lastfm/disconnect', {}),
    onSuccess: () => refetchLastfm(),
  });

  const [createError, setCreateError] = useState('');

  const createLibrary = useMutation({
    mutationFn: (data: { name: string; path: string }) =>
      api.post<ApiData<Library>>('/libraries', data),
    onSuccess: () => {
      setNewLibName('');
      setNewLibPath('');
      setCreateError('');
      refetch();
    },
    onError: (err: Error) => {
      setCreateError(err.message || 'Bibliothek konnte nicht hinzugefügt werden');
    },
  });

  const scanLibrary = useMutation({
    mutationFn: (id: string) =>
      api.post<ApiData<{ jobId: string }>>(`/libraries/${id}/scan`, {}),
  });

  const libraries = librariesData?.data ?? [];
  const lastfm = lastfmData?.data;

  return (
    <div className="space-y-8 max-w-2xl mx-auto text-white">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Last.fm Scrobbling</h2>
        <div className="rounded-xl border border-white/5 p-6 bg-white/5 space-y-4 shadow-inner">
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
            <div className={`p-3 rounded-lg text-sm ${
              lastfmFeedback.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
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
              className="font-bold"
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
            <div className="h-12 w-12 bg-red-500/10 rounded-xl flex items-center justify-center">
              <Music2 className="h-6 w-6 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white">Last.fm Account</p>
              <p className="text-sm text-muted-foreground">
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
                variant="secondary" 
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
        <h2 className="text-xl font-semibold">Musik-Bibliotheken</h2>
        {libraries.length > 0 && (
          <div className="space-y-2">
            {libraries.map((lib: Library) => (
              <div
                key={lib.id}
                className="flex items-center justify-between rounded-lg border border-border p-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FolderOpen className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{lib.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{lib.path}</p>
                    {lib.lastScannedAt && (
                      <p className="text-xs text-muted-foreground">
                        Zuletzt gescannt: {new Date(lib.lastScannedAt).toLocaleString('de-DE')}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => scanLibrary.mutate(lib.id)}
                  disabled={scanLibrary.isPending}
                >
                  {scanLibrary.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Scannen
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="text-sm font-medium">Neue Bibliothek hinzufügen</h3>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Name (z.B. Meine Musik)"
              value={newLibName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLibName(e.target.value)}
              className="w-full rounded-md border border-input bg-black px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring text-white"
            />
            <input
              type="text"
              placeholder="Pfad (z.B. /music)"
              value={newLibPath}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewLibPath(e.target.value)}
              className="w-full rounded-md border border-input bg-black px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring text-white"
            />
          </div>
          {createError && <p className="text-sm text-red-500">{createError}</p>}
          <Button
            onClick={() => createLibrary.mutate({ name: newLibName, path: newLibPath })}
            disabled={!newLibName || !newLibPath || createLibrary.isPending}
            size="sm"
          >
            {createLibrary.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Bibliothek hinzufügen
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Radio Einstellungen</h2>
        <div className="rounded-xl border border-white/5 p-6 bg-white/5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-pink-500/10 rounded-xl flex items-center justify-center">
              <RadioIcon className="h-6 w-6 text-pink-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white">Bevorzugte Region</p>
              <p className="text-sm text-muted-foreground">Wähle aus, welche regionalen Sender standardmäßig angezeigt werden sollen.</p>
            </div>
            <select 
              value={radioRegion}
              onChange={(e) => setRadioRegion(e.target.value)}
              className="bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all outline-none"
            >
              {REGIONS.map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Darstellung</h2>
        <p className="text-sm text-muted-foreground">
          Das dunkle Theme ist standardmäßig aktiv.
        </p>
      </section>
    </div>
  );
}
