import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { usePlayerStore, type PodcastEpisodePlayerItem } from '@/stores/playerStore';
import type { PodcastDetail as PodcastDetailType, PodcastEpisode, ApiResponse } from '@musicserver/shared';
import { Play, Pause, RefreshCw, Trash2, Loader2, CalendarDays, Clock } from 'lucide-react';

function formatPodcastDuration(seconds: number | null): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PodcastDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [expandedEp, setExpandedEp] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['podcast', id],
    queryFn: () => api.get<ApiResponse<PodcastDetailType>>(`/podcasts/${id}`),
    enabled: !!id,
  });

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

  if (isLoading) {
    return <div className="text-muted-foreground p-8">Lade Podcast...</div>;
  }
  if (!podcast) {
    return <div className="text-muted-foreground p-8">Podcast nicht gefunden</div>;
  }

  const episodes = podcast.episodes ?? [];

  const toPlayerItem = (ep: PodcastEpisode): PodcastEpisodePlayerItem => ({
    id: ep.id,
    title: ep.title,
    audioUrl: ep.audioUrl,
    imageUrl: ep.imageUrl ?? podcast.imageUrl,
    podcastTitle: podcast.title,
    duration: ep.duration,
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
            Episoden
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({episodes.length})
            </span>
          </h2>

          {episodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Episoden vorhanden</p>
          ) : (
            <div className="space-y-1">
              {episodes.map((ep) => {
                const isCurrent = currentEpId === ep.id;
                const isExpanded = expandedEp === ep.id;

                return (
                  <div
                    key={ep.id}
                    className={`rounded-lg border border-transparent transition-colors ${isCurrent ? 'bg-muted/60 border-border' : 'hover:bg-muted/30'}`}
                  >
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Artwork */}
                      <div className="h-12 w-12 rounded-md overflow-hidden bg-muted shrink-0">
                        {ep.imageUrl ?? podcast.imageUrl ? (
                          <img
                            src={(ep.imageUrl ?? podcast.imageUrl)!}
                            alt={ep.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-xl">🎙️</div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium truncate cursor-pointer hover:underline ${isCurrent ? 'text-primary' : ''}`}
                          onClick={() => setExpandedEp(isExpanded ? null : ep.id)}
                        >
                          {ep.title}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                          {ep.publishedAt && (
                            <span className="flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {formatDate(ep.publishedAt)}
                            </span>
                          )}
                          {ep.duration && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatPodcastDuration(ep.duration)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Play button */}
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

                    {/* Expanded description */}
                    {isExpanded && ep.description && (
                      <div className="px-4 pb-4 pt-0">
                        <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">
                          {ep.description.replace(/<[^>]+>/g, '').trim()}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
