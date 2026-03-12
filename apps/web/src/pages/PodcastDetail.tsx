import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { usePlayerStore, type PodcastEpisodePlayerItem } from '@/stores/playerStore';
import type { PodcastDetail as PodcastDetailType, PodcastEpisode, ApiResponse } from '@musicserver/shared';
import { Play, Pause, RefreshCw, Trash2, Loader2, CalendarDays, Clock, PlusCircle } from 'lucide-react';

const PAGE_SIZE = 10;

function formatPodcastDuration(seconds: number | null): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} Std. ${m > 0 ? `${m} Min.` : ''}`.trim();
  return `${m} Min.`;
}

function formatRemaining(progress: number, duration: number): string {
  const remaining = Math.max(0, duration - progress);
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  if (h > 0) return `${h} Std. ${m > 0 ? `${m} Min.` : ''} verbleibend`.trim();
  if (m > 0) return `${m} Min. verbleibend`;
  return 'Fast fertig';
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PodcastDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [episodeCount, setEpisodeCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['podcast', id],
    queryFn: () => api.get<ApiResponse<PodcastDetailType>>(`/podcasts/${id}?limit=${PAGE_SIZE}&offset=0`),
    enabled: !!id,
  });

  // Sync initial data into local state
  useEffect(() => {
    if (data?.data) {
      setEpisodes(data.data.episodes ?? []);
      setEpisodeCount(data.data.episodeCount ?? 0);
      setOffset(data.data.episodes?.length ?? 0);
    }
  }, [data]);

  const refreshMutation = useMutation({
    mutationFn: () => api.post(`/podcasts/${id}/refresh`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['podcast', id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/podcasts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['podcasts'] });
      history.back();
    },
  });

  const { playPodcastEpisode, currentTrack, isPlaying, togglePlay } = usePlayerStore();

  const podcast = data?.data;

  const loadMore = async () => {
    if (!id || isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const res = await api.get<ApiResponse<PodcastDetailType>>(
        `/podcasts/${id}?limit=${PAGE_SIZE}&offset=${offset}`,
      );
      const newEps = res.data?.episodes ?? [];
      setEpisodes((prev) => [...prev, ...newEps]);
      setOffset((prev) => prev + newEps.length);
    } finally {
      setIsFetchingMore(false);
    }
  };

  if (isLoading) {
    return <div className="text-muted-foreground p-8">Lade Podcast...</div>;
  }
  if (!podcast) {
    return <div className="text-muted-foreground p-8">Podcast nicht gefunden</div>;
  }

  const toPlayerItem = (ep: PodcastEpisode): PodcastEpisodePlayerItem => ({
    id: ep.id,
    title: ep.title,
    audioUrl: ep.audioUrl,
    imageUrl: ep.imageUrl ?? podcast.imageUrl,
    podcastTitle: podcast.title,
    duration: ep.duration,
    listenProgress: ep.listenProgress,
    isPodcast: true,
  });

  const currentEpId = currentTrack && 'isPodcast' in currentTrack ? currentTrack.id : null;

  const handlePlay = (ep: PodcastEpisode) => {
    if (currentEpId === ep.id) {
      togglePlay();
    } else {
      playPodcastEpisode(toPlayerItem(ep));
    }
  };

  const remaining = episodeCount - episodes.length;

  return (
    <div className="space-y-0 -mx-6 -mt-6">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden min-h-[280px] flex items-end">
        {podcast.imageUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center scale-110"
            style={{ backgroundImage: `url(${podcast.imageUrl})`, filter: 'blur(40px) brightness(0.3)' }}
          />
        )}
        {!podcast.imageUrl && (
          <div className="absolute inset-0 bg-gradient-to-b from-orange-900/40 to-background" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />

        <div className="relative z-10 flex items-end gap-6 px-6 pb-6 w-full">
          <div className="h-40 w-40 rounded-xl overflow-hidden bg-muted shrink-0 shadow-2xl border border-white/10">
            {podcast.imageUrl ? (
              <img src={podcast.imageUrl} alt={podcast.title} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-5xl">🎙️</div>
            )}
          </div>

          <div className="space-y-1.5 min-w-0 pb-1">
            <p className="text-xs uppercase tracking-widest text-white/60 font-semibold">Podcast</p>
            <h1 className="text-4xl font-black truncate text-white drop-shadow-lg">{podcast.title}</h1>
            {podcast.author && (
              <p className="text-sm text-white/60">{podcast.author}</p>
            )}
            <p className="text-sm text-white/50">
              {podcast.episodeCount} {podcast.episodeCount === 1 ? 'Episode' : 'Episoden'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Action Bar ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
        >
          {refreshMutation.isPending
            ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            : <RefreshCw className="h-4 w-4 mr-1.5" />}
          Aktualisieren
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="text-red-400 hover:text-red-300 border-red-400/30 hover:border-red-300/50 hover:bg-red-500/10"
          onClick={() => {
            if (confirm(`"${podcast.title}" wirklich abbestellen?`)) deleteMutation.mutate();
          }}
          disabled={deleteMutation.isPending}
        >
          <Trash2 className="h-4 w-4 mr-1.5" />
          Abbestellen
        </Button>

        {refreshMutation.isSuccess && (
          <span className="text-xs text-green-500">Feed aktualisiert</span>
        )}
      </div>

      <div className="px-6 space-y-8 pb-8">
        {/* ── Beschreibung ─────────────────────────────────────────── */}
        {podcast.description && (
          <section>
            <h2 className="text-lg font-semibold mb-2">Über diesen Podcast</h2>
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
              {podcast.description}
            </p>
          </section>
        )}

        {/* ── Episoden ─────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xl font-semibold mb-4">
            Alle Folgen
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({episodeCount})
            </span>
          </h2>

          {episodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Episoden vorhanden</p>
          ) : (
            <div className="divide-y divide-border">
              {episodes.map((ep) => {
                const isCurrent = currentEpId === ep.id;
                const hasProgress = ep.listenProgress != null && ep.listenProgress > 0 && ep.duration != null;
                const progressPct = hasProgress
                  ? Math.min(100, ((ep.listenProgress ?? 0) / ep.duration!) * 100)
                  : 0;
                const thumb = ep.imageUrl ?? podcast.imageUrl;

                return (
                  <div
                    key={ep.id}
                    className={`flex items-start gap-4 py-4 transition-colors ${isCurrent ? 'bg-muted/40' : 'hover:bg-muted/20'}`}
                  >
                    {/* Thumbnail */}
                    <div className="h-16 w-24 rounded-md overflow-hidden bg-muted shrink-0">
                      {thumb ? (
                        <img src={thumb} alt={ep.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-2xl">🎙️</div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className={`text-sm font-semibold leading-snug line-clamp-1 ${isCurrent ? 'text-primary' : ''}`}>
                        {ep.title}
                      </p>
                      <p className="text-xs text-muted-foreground font-medium">{podcast.title}</p>
                      {ep.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                          {ep.description.replace(/<[^>]+>/g, '').trim()}
                        </p>
                      )}
                      {/* Meta row */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-0.5">
                        {ep.publishedAt && (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {formatDate(ep.publishedAt)}
                          </span>
                        )}
                        {ep.duration && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {hasProgress
                                ? formatRemaining(ep.listenProgress!, ep.duration)
                                : formatPodcastDuration(ep.duration)}
                            </span>
                          </>
                        )}
                      </div>
                      {/* Progress bar */}
                      {hasProgress && (
                        <div className="h-0.5 w-full rounded-full bg-muted overflow-hidden mt-1">
                          <div
                            className="h-full rounded-full bg-primary/80"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0 pt-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        title="Zur Warteliste"
                      >
                        <PlusCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={isCurrent ? 'secondary' : 'ghost'}
                        size="icon"
                        className="h-9 w-9 rounded-full shrink-0"
                        onClick={() => handlePlay(ep)}
                      >
                        {isCurrent && isPlaying ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4 ml-0.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Mehr anzeigen */}
          {remaining > 0 && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={isFetchingMore}
                className="min-w-[220px]"
              >
                {isFetchingMore ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {isFetchingMore
                  ? 'Lade...'
                  : `${remaining} weitere ${remaining === 1 ? 'Folge' : 'Folgen'} anzeigen`}
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
