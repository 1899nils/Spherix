import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { useVideoPlayerStore } from '@/stores/videoPlayerStore';
import { Button } from '@/components/ui/button';
import { formatRuntime } from '@/lib/utils';
import { Play, ArrowLeft, Tv, ChevronDown, ChevronRight } from 'lucide-react';
import type { SeriesDetail as SeriesDetailType } from '@musicserver/shared';

interface SeriesDetailResponse {
  data: SeriesDetailType;
}

export function SeriesDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setActiveVideo } = useVideoPlayerStore();

  const [activeEpisode, setActiveEpisode] = useState<{ id: string; title: string; seasonNumber: number; episodeNumber: number; runtime: number | null } | null>(null);
  const [openSeason, setOpenSeason] = useState<number | null>(1);

  const { data, isLoading } = useQuery({
    queryKey: ['series', id],
    queryFn: () => api.get<SeriesDetailResponse>(`/video/series/${id}`),
    enabled: !!id,
  });

  const progressMutation = useMutation({
    mutationFn: ({ epId, position }: { epId: string; position: number }) =>
      api.post(`/video/episodes/${epId}/progress`, { position }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['series', id] }),
  });

  const series = data?.data;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-white/5 rounded w-1/3" />
        <div className="h-4 bg-white/5 rounded w-2/3" />
      </div>
    );
  }

  if (!series) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
        <Tv className="h-12 w-12 opacity-30" />
        <p>Serie nicht gefunden</p>
        <Button variant="ghost" onClick={() => navigate('/video/series')}>Zurück</Button>
      </div>
    );
  }

  const handlePlayEpisode = (ep: typeof activeEpisode) => {
    if (!ep) return;
    setActiveEpisode(ep);
    setActiveVideo({
      id: ep.id,
      title: ep.title,
      type: 'episode',
      streamUrl: `/api/video/episodes/${ep.id}/stream`,
      posterUrl: series.posterPath,
      seriesTitle: series.title,
      runtime: ep.runtime,
    });
  };

  const handleClosePlayer = () => {
    setActiveEpisode(null);
    setActiveVideo(null);
  };

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 text-muted-foreground hover:text-white"
        onClick={() => navigate('/video/series')}
      >
        <ArrowLeft className="h-4 w-4" />
        Alle Serien
      </Button>

      {activeEpisode ? (
        /* ── Episode player ───────────────────────────────────── */
        <VideoPlayer
          src={`/api/video/episodes/${activeEpisode.id}/stream`}
          title={`S${String(activeEpisode.seasonNumber).padStart(2, '0')}E${String(activeEpisode.episodeNumber).padStart(2, '0')} · ${activeEpisode.title}`}
          subtitle={series.title}
          posterUrl={series.posterPath}
          onClose={handleClosePlayer}
          onProgress={(pos) => progressMutation.mutate({ epId: activeEpisode.id, position: pos })}
        />
      ) : (
        /* ── Series detail ────────────────────────────────────── */
        <div className="flex flex-col gap-8">
          {/* Header */}
          <div className="flex gap-6 items-start">
            <div className="shrink-0 w-40 aspect-[2/3] rounded-xl overflow-hidden bg-white/5 border border-white/10 shadow-xl">
              {series.posterPath ? (
                <img src={series.posterPath} alt={series.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
                  <Tv className="h-12 w-12" />
                </div>
              )}
            </div>

            <div className="space-y-3 min-w-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Serie</p>
              <h1 className="text-3xl font-bold">{series.title}</h1>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                {series.year && <span>{series.year}</span>}
                {series.seasons && (
                  <>
                    <span className="text-white/20">·</span>
                    <span>{series.seasons.length} Staffel{series.seasons.length !== 1 ? 'n' : ''}</span>
                  </>
                )}
              </div>
              {series.genres && series.genres.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {series.genres.map((g) => (
                    <span key={g.id} className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/70">
                      {g.name}
                    </span>
                  ))}
                </div>
              )}
              {series.overview && (
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">{series.overview}</p>
              )}
            </div>
          </div>

          {/* Season/Episode list */}
          <div className="space-y-3">
            {(series.seasons ?? []).map((season) => (
              <div key={season.id} className="rounded-xl border border-white/10 overflow-hidden">
                {/* Season header */}
                <button
                  className="w-full flex items-center justify-between px-5 py-4 bg-white/5 hover:bg-white/10 transition-colors"
                  onClick={() => setOpenSeason(openSeason === season.seasonNumber ? null : season.seasonNumber)}
                >
                  <span className="font-semibold">
                    Staffel {season.seasonNumber}
                    <span className="ml-2 text-sm text-muted-foreground font-normal">
                      {season.episodes?.length ?? 0} Folge{(season.episodes?.length ?? 0) !== 1 ? 'n' : ''}
                    </span>
                  </span>
                  {openSeason === season.seasonNumber
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>

                {/* Episodes */}
                {openSeason === season.seasonNumber && (
                  <div className="divide-y divide-white/5">
                    {(season.episodes ?? []).map((ep) => (
                      <div
                        key={ep.id}
                        className="flex items-center gap-4 px-5 py-3 hover:bg-white/5 transition-colors group"
                      >
                        <span className="text-xs text-muted-foreground tabular-nums w-8 shrink-0">
                          {ep.episodeNumber}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{ep.title}</p>
                          {ep.runtime && (
                            <p className="text-xs text-muted-foreground">{formatRuntime(ep.runtime)}</p>
                          )}
                        </div>
                        {ep.watched && (
                          <span className="text-xs text-green-400 font-medium shrink-0">✓</span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10"
                          onClick={() =>
                            handlePlayEpisode({
                              id: ep.id,
                              title: ep.title,
                              seasonNumber: season.seasonNumber,
                              episodeNumber: ep.episodeNumber,
                              runtime: ep.runtime ?? null,
                            })
                          }
                        >
                          <Play className="h-4 w-4 fill-current" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
