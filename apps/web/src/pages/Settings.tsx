import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import type { Library } from '@musicserver/shared';
import { FolderOpen, Loader2, RefreshCw, Music2 } from 'lucide-react';

interface ApiData<T> {
  data: T;
}

export function Settings() {
  const [newLibName, setNewLibName] = useState('');
  const [newLibPath, setNewLibPath] = useState('');

  const { data: librariesData, refetch } = useQuery({
    queryKey: ['libraries'],
    queryFn: () => api.get<ApiData<Library[]>>('/libraries'),
  });

  const { data: lastfmData, refetch: refetchLastfm } = useQuery({
    queryKey: ['lastfm-status'],
    queryFn: () => api.get<ApiData<{ connected: boolean; username: string | null }>>('/lastfm/status'),
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
    <div className="space-y-8 max-w-2xl text-white">
      <div>
        <h1 className="text-3xl font-bold text-white">Einstellungen</h1>
        <p className="text-muted-foreground mt-1">Serverkonfiguration</p>
      </div>

      {/* Last.fm Integration */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Last.fm Scrobbling</h2>
        <div className="rounded-lg border border-border p-6 bg-white/5">
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

      {/* Libraries */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Musik-Bibliotheken</h2>

        {/* Existing Libraries */}
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

        {/* Add Library Form */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="text-sm font-medium">Neue Bibliothek hinzufügen</h3>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Name (z.B. Meine Musik)"
              value={newLibName}
              onChange={(e) => setNewLibName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              type="text"
              placeholder="Pfad (z.B. /music)"
              value={newLibPath}
              onChange={(e) => setNewLibPath(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {createError && (
            <p className="text-sm text-red-500">{createError}</p>
          )}
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

      {/* Theme */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Darstellung</h2>
        <p className="text-sm text-muted-foreground">
          Das dunkle Theme ist standardmäßig aktiv.
        </p>
      </section>
    </div>
  );
}
