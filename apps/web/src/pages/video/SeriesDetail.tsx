import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { useVideoPlayerStore } from '@/stores/videoPlayerStore';
import { Button } from '@/components/ui/button';
import { formatRuntime } from '@/lib/utils';
import { Play, ArrowLeft, Tv, ChevronDown, ChevronRight, Pencil, Link2, AlertCircle } from 'lucide-react';
import type { SeriesDetail as SeriesDetailType } from '@musicserver/shared';
import { MediaMetadataEditor } from '@/components/MediaMetadataEditor';
import { TmdbSearchModal } from '@/components/video/TmdbSearchModal';

interface SeriesDetailResponse {
  data: SeriesDetailType;
}

export function SeriesDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setActiveVideo } = useVideoPlayerStore();

  const [activeEpisode, setActiveEpisode] = useState<{ id: string; title: string; seasonNum: number; episodeNum: number; runtime: number | null } | null>(null);
  const [openSeason, setOpenSeason] = useState<number | null>(1);
  const [showSeriesEditor, setShowSeriesEditor] = useState(false);
  const [editEpisodeId, setEditEpisodeId] = useState<string | null>(null);
  const [showTmdbModal, setShowTmdbModal] = useState(false);

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

      {/* ── Episode player ───────────────────────────────────── */}
      {activeEpisode && (
        <div className="fixed inset-0 z-50 bg-black">
          <VideoPlayer
            src={`/api/video/episodes/${activeEpisode.id}/stream`}
            title={`S${String(activeEpisode.seasonNum).padStart(2, '0')}E${String(activeEpisode.episodeNum).padStart(2, '0')} · ${activeEpisode.title}`}
            subtitle={series.title}
            posterUrl={series.posterPath}
            duration={activeEpisode.runtime ? activeEpisode.runtime * 60 : null}
            onClose={handleClosePlayer}
            onProgress={(pos) => progressMutation.mutate({ epId: activeEpisode.id, position: pos })}
            nextEpisode={(() => {
              // Find next episode
              const currentSeason = series.seasons?.find(s => s.number === activeEpisode.seasonNum);
              const currentEpIndex = currentSeason?.episodes?.findIndex(e => e.id === activeEpisode.id) ?? -1;
              const nextEp = currentSeason?.episodes?.[currentEpIndex + 1];
              
              if (nextEp) {
                return {
                  title: `S${String(activeEpisode.seasonNum).padStart(2, '0')}E${String(nextEp.number).padStart(2, '0')} · ${nextEp.title}`,
                  thumbnail: series.posterPath || undefined,
                  onPlay: () => handlePlayEpisode({
                    id: nextEp.id,
                    title: nextEp.title,
                    seasonNum: activeEpisode.seasonNum,
                    episodeNum: nextEp.number,
                    runtime: nextEp.runtime ?? null,
                  }),
                };
              }
              return null;
            })()}
          />
        </div>
      )}

      {!activeEpisode && (
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
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold">{series.title}</h1>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-white"
                  onClick={() => setShowSeriesEditor(true)}
                  title="Metadaten bearbeiten"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant={series.tmdbId ? "ghost" : "default"}
                  size="icon"
                  className={`h-8 w-8 shrink-0 ${!series.tmdbId ? 'bg-amber-500 hover:bg-amber-600 text-black border-amber-500' : 'text-muted-foreground hover:text-white'}`}
                  onClick={() => setShowTmdbModal(true)}
                  title={series.tmdbId ? 'TMDb Verknüpfung bearbeiten' : 'Mit TMDb verknüpfen'}
                >
                  <Link2 className="h-4 w-4" />
                </Button>
              </div>
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
              {series.overview ? (
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">{series.overview}</p>
              ) : !series.tmdbId && (
                <div className="flex items-start gap-2 text-amber-400/80 text-sm bg-amber-500/10 rounded-lg p-3">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-400">Keine Metadaten verfügbar</p>
                    <p className="text-xs mt-0.5">Diese Serie ist nicht mit TMDb verknüpft.</p>
                  </div>
                </div>
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
                  onClick={() => setOpenSeason(openSeason === season.number ? null : season.number)}
                >
                  <span className="font-semibold">
                    Staffel {season.number}
                    <span className="ml-2 text-sm text-muted-foreground font-normal">
                      {season.episodes?.length ?? 0} Folge{(season.episodes?.length ?? 0) !== 1 ? 'n' : ''}
                    </span>
                  </span>
                  {openSeason === season.number
                    ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>

                {/* Episodes */}
                {openSeason === season.number && (
                  <div className="divide-y divide-white/5">
                    {(season.episodes ?? []).map((ep) => (
                      <div
                        key={ep.id}
                        className="flex items-center gap-4 px-5 py-3 hover:bg-white/5 transition-colors group"
                      >
                        <span className="text-xs text-muted-foreground tabular-nums w-8 shrink-0">
                          {ep.number}
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
                              seasonNum: season.number,
                              episodeNum: ep.number,
                              runtime: ep.runtime ?? null,
                            })
                          }
                        >
                          <Play className="h-4 w-4 fill-current" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10"
                          onClick={(e) => { e.stopPropagation(); setEditEpisodeId(ep.id); }}
                          title="Metadaten bearbeiten"
                        >
                          <Pencil className="h-4 w-4" />
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

      {/* Series metadata editor */}
      {series && (
        <MediaMetadataEditor
          isOpen={showSeriesEditor}
          onClose={() => setShowSeriesEditor(false)}
          type="series"
          id={series.id}
          initialData={{
            title:    series.title,
            year:     series.year,
            overview: series.overview,
          }}
        />
      )}

      {/* Episode metadata editor */}
      {editEpisodeId && series && (() => {
        const ep = series.seasons?.flatMap(s => s.episodes ?? []).find(e => e.id === editEpisodeId);
        return ep ? (
          <MediaMetadataEditor
            isOpen={!!editEpisodeId}
            onClose={() => setEditEpisodeId(null)}
            type="episode"
            id={editEpisodeId}
            initialData={{
              title:    ep.title,
              number:   ep.number,
              overview: ep.overview,
              runtime:  ep.runtime,
            }}
          />
        ) : null;
      })()}

      {/* TMDb Search Modal */}
      {series && (
        <TmdbSearchModal
          isOpen={showTmdbModal}
          onClose={() => setShowTmdbModal(false)}
          type="series"
          item={series}
        />
      )}
    </div>
  );
}
