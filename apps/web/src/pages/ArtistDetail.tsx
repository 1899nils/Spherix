import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/utils';
import { usePlayerStore } from '@/stores/playerStore';
import { MetadataEditModal } from '@/components/MetadataEditModal';
import type { ArtistDetail as ArtistDetailType, ApiResponse, AlbumWithRelations, TrackWithRelations } from '@musicserver/shared';
import { Play, Pause, Disc3, Mic2, Pencil, Download, Music, ChevronDown, ChevronUp, Video, ListMusic, Loader2 } from 'lucide-react';

type DiscographyFilter = 'all' | 'album' | 'single_ep';

function getYoutubeThumbnail(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null;
}

function releaseTypeLabel(type: string | null): string {
  if (!type) return 'Album';
  const t = type.toLowerCase();
  if (t === 'single') return 'Single';
  if (t === 'ep') return 'EP';
  return 'Album';
}

function DiscographyCard({ album }: { album: AlbumWithRelations }) {
  return (
    <Link
      to={`/music/albums/${album.id}`}
      className="group flex-shrink-0 w-40 flex flex-col"
    >
      <div className="aspect-square rounded-md overflow-hidden bg-[#282828] mb-3">
        {album.coverUrl ? (
          <img
            src={album.coverUrl}
            alt={album.title}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-[#b3b3b3]">
            <Disc3 className="h-10 w-10" />
          </div>
        )}
      </div>
      <p className="font-medium text-sm text-white truncate leading-tight">{album.title}</p>
      <p className="text-xs text-[#b3b3b3] mt-0.5">
        {album.year ?? '—'} &middot; {releaseTypeLabel(album.releaseType)}
      </p>
    </Link>
  );
}

function PlaylistCard({ playlist }: { playlist: { id: string; name: string; coverUrl: string | null; _count: { tracks: number } } }) {
  return (
    <Link
      to={`/music/playlists/${playlist.id}`}
      className="group flex-shrink-0 w-40 flex flex-col"
    >
      <div className="aspect-square rounded-md overflow-hidden bg-[#282828] mb-3">
        {playlist.coverUrl ? (
          <img
            src={playlist.coverUrl}
            alt={playlist.name}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-[#b3b3b3]">
            <ListMusic className="h-10 w-10" />
          </div>
        )}
      </div>
      <p className="font-medium text-sm text-white truncate">{playlist.name}</p>
      <p className="text-xs text-[#b3b3b3] mt-0.5">{playlist._count.tracks} Titel</p>
    </Link>
  );
}

function MusicVideoCard({
  track,
  onPlay,
  onDownload,
  isDownloading,
}: {
  track: TrackWithRelations;
  onPlay: () => void;
  onDownload: () => void;
  isDownloading: boolean;
}) {
  const isLocal = track.musicVideoSource === 'local';
  const isPending = isDownloading || track.musicVideoSource === 'downloading';
  const thumb = track.musicVideoUrl ? getYoutubeThumbnail(track.musicVideoUrl) : null;

  return (
    <div className="group flex-shrink-0 w-44 flex flex-col">
      {/* Thumbnail */}
      <button
        onClick={onPlay}
        className="w-full rounded-md overflow-hidden bg-[#282828] mb-2 relative focus:outline-none"
        style={{ aspectRatio: '16/9' }}
      >
        {thumb ? (
          <img src={thumb} alt={track.title} className="h-full w-full object-cover group-hover:brightness-75 transition" />
        ) : track.album?.coverUrl ? (
          <img src={track.album.coverUrl} alt={track.title} className="h-full w-full object-cover group-hover:brightness-75 transition" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-[#b3b3b3]">
            <Video className="h-8 w-8" />
          </div>
        )}
        {/* Local badge */}
        {isLocal && (
          <span className="absolute top-1.5 left-1.5 text-[10px] font-bold bg-green-600 text-white px-1.5 py-0.5 rounded">
            Lokal
          </span>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
          <div className="h-10 w-10 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="h-5 w-5 text-white fill-white" />
          </div>
        </div>
      </button>

      {/* Title row */}
      <div className="flex items-center gap-1 min-w-0">
        {track.explicit && (
          <span className="flex-shrink-0 inline-flex items-center justify-center h-3.5 px-1 text-[9px] font-bold bg-[#ffffff1a] text-[#b3b3b3] rounded">E</span>
        )}
        <p className="text-sm text-white font-medium truncate">{track.title}</p>
      </div>
      <p className="text-xs text-[#b3b3b3] truncate mt-0.5">{track.album?.title ?? '—'}</p>

      {/* Download button */}
      {!isLocal && (
        <button
          onClick={onDownload}
          disabled={isPending}
          className="mt-1.5 flex items-center gap-1 text-xs text-[#b3b3b3] hover:text-white disabled:opacity-50 transition-colors"
        >
          {isPending
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Wird heruntergeladen...</>
            : <><Download className="h-3 w-3" /> Herunterladen</>}
        </button>
      )}
    </div>
  );
}

export function ArtistDetail() {
  const { id } = useParams<{ id: string }>();
  const [editOpen, setEditOpen] = useState(false);
  const [tracksExpanded, setTracksExpanded] = useState(false);
  const [discoFilter, setDiscoFilter] = useState<DiscographyFilter>('all');
  const [bioExpanded, setBioExpanded] = useState(false);
  const [videoTrackId, setVideoTrackId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['artist', id],
    queryFn: () => api.get<ApiResponse<ArtistDetailType & { playlists: { id: string; name: string; coverUrl: string | null; _count: { tracks: number } }[] }>>(`/artists/${id}`),
    enabled: !!id,
  });

  const fetchMetaMutation = useMutation({
    mutationFn: () => api.post(`/artists/${id}/fetch-metadata`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artist', id] });
      queryClient.invalidateQueries({ queryKey: ['artists'] });
    },
  });

  const [downloadingTrackIds, setDownloadingTrackIds] = useState<Set<string>>(new Set());

  const downloadVideoMutation = useMutation({
    mutationFn: (trackId: string) => api.post(`/tracks/${trackId}/musicvideo/download`, {}),
    onMutate: (trackId) => {
      setDownloadingTrackIds(prev => new Set(prev).add(trackId));
    },
    onSettled: (_, __, trackId) => {
      // Poll for completion every 5s, up to 10 minutes
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const res = await api.get<{ data: { source: string } }>(`/tracks/${trackId}/musicvideo/status`);
          if (res.data.source !== 'downloading') {
            clearInterval(interval);
            setDownloadingTrackIds(prev => { const s = new Set(prev); s.delete(trackId); return s; });
            queryClient.invalidateQueries({ queryKey: ['artist', id] });
          }
        } catch { /* ignore */ }
        if (attempts >= 120) {
          clearInterval(interval);
          setDownloadingTrackIds(prev => { const s = new Set(prev); s.delete(trackId); return s; });
        }
      }, 5000);
    },
  });

  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayerStore();

  const artist = data?.data;

  if (isLoading) return <div className="text-[#b3b3b3] p-8">Lade Künstler...</div>;
  if (!artist) return <div className="text-[#b3b3b3] p-8">Künstler nicht gefunden</div>;

  const albums = artist.albums ?? [];
  const tracks = artist.tracks ?? [];
  const playlists = (artist as typeof artist & { playlists?: { id: string; name: string; coverUrl: string | null; _count: { tracks: number } }[] }).playlists ?? [];

  // Top tracks: first 10 (later: by playCount)
  const topTracks = tracks.slice(0, 10);
  const visibleTracks = tracksExpanded ? topTracks : topTracks.slice(0, 5);

  // Discography filter
  const filteredAlbums = albums.filter(a => {
    if (discoFilter === 'all') return true;
    const t = (a.releaseType ?? 'album').toLowerCase();
    if (discoFilter === 'album') return t === 'album' || t === 'lp';
    return t === 'single' || t === 'ep';
  });

  // Tracks with music video
  const videoTracks = tracks.filter(t => t.musicVideoUrl);

  // Active video track for player
  const videoTrack = videoTracks.find(t => t.id === videoTrackId);

  const handlePlayAll = () => {
    if (tracks.length > 0) playTrack(tracks[0], tracks);
  };

  const isArtistPlaying = currentTrack && tracks.some(t => t.id === currentTrack.id) && isPlaying;

  // Bio line count check
  const bioLines = (artist.biography ?? '').split('\n');
  const bioNeedsCollapse = bioLines.length > 5 || (artist.biography ?? '').length > 500;

  return (
    <div className="space-y-0 -mx-6 -mt-6">
      {/* ── Hero (unverändert) ───────────────────────────────── */}
      <div className="relative overflow-hidden min-h-[320px] flex items-end">
        {artist.imageUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center scale-110"
            style={{ backgroundImage: `url(${artist.imageUrl})`, filter: 'blur(40px) brightness(0.35)' }}
          />
        )}
        {!artist.imageUrl && (
          <div className="absolute inset-0 bg-gradient-to-b from-muted to-background" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="relative z-10 flex items-end gap-6 px-6 pb-6 w-full">
          <div className="h-44 w-44 rounded-full overflow-hidden bg-muted shrink-0 shadow-2xl border border-white/10">
            {artist.imageUrl ? (
              <img src={artist.imageUrl} alt={artist.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                <Mic2 className="h-20 w-20" />
              </div>
            )}
          </div>
          <div className="space-y-2 min-w-0 pb-1">
            <p className="text-xs uppercase tracking-widest text-white/70 font-semibold">Künstler</p>
            <h1 className="text-5xl font-black truncate text-white drop-shadow-lg leading-tight">{artist.name}</h1>
            <p className="text-sm text-white/60">
              {artist.albumCount} {artist.albumCount === 1 ? 'Album' : 'Alben'} &middot; {artist.trackCount} Tracks
            </p>
          </div>
        </div>
      </div>

      {/* ── Action Bar (unverändert) ─────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-5">
        {tracks.length > 0 && (
          <Button size="lg" className="rounded-full px-8" onClick={isArtistPlaying ? togglePlay : handlePlayAll}>
            {isArtistPlaying ? <Pause className="h-5 w-5 mr-2" /> : <Play className="h-5 w-5 mr-2" />}
            {isArtistPlaying ? 'Pause' : 'Abspielen'}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4 mr-1.5" />
          Bearbeiten
        </Button>
        <Button variant="outline" size="sm" onClick={() => fetchMetaMutation.mutate()} disabled={fetchMetaMutation.isPending}>
          <Download className="h-4 w-4 mr-1.5" />
          {fetchMetaMutation.isPending ? 'Lade...' : 'Metadaten abrufen'}
        </Button>
        {fetchMetaMutation.isError && <span className="text-xs text-red-500">{(fetchMetaMutation.error as Error).message}</span>}
        {fetchMetaMutation.isSuccess && <span className="text-xs text-green-500">Metadaten aktualisiert</span>}
      </div>

      <div className="px-6 space-y-10 pb-8">

        {/* ── Beliebte Titel ──────────────────────────────────── */}
        {topTracks.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">Beliebte Titel</h2>
            <div className="space-y-0.5">
              {visibleTracks.map((track, index) => {
                const isCurrent = currentTrack?.id === track.id;
                return (
                  <div
                    key={track.id}
                    className={`group grid grid-cols-[32px_auto_1fr_auto] gap-3 px-3 py-2 rounded-md text-sm hover:bg-[#ffffff1a] cursor-pointer transition-colors items-center ${isCurrent ? 'bg-[#ffffff14]' : ''}`}
                    onClick={() => playTrack(track, tracks)}
                  >
                    <span className="text-[#b3b3b3] text-right select-none">
                      <span className="group-hover:hidden">
                        {isCurrent && isPlaying
                          ? <Music className="h-4 w-4 text-[#dc2626] mx-auto" />
                          : <span className={isCurrent ? 'text-[#dc2626]' : ''}>{index + 1}</span>}
                      </span>
                      <Play className="h-4 w-4 hidden group-hover:block text-white mx-auto" />
                    </span>
                    {/* Album cover */}
                    <div className="h-10 w-10 rounded overflow-hidden bg-[#282828] flex-shrink-0">
                      {track.album?.coverUrl
                        ? <img src={track.album.coverUrl} alt="" className="h-full w-full object-cover" />
                        : <div className="h-full w-full flex items-center justify-center"><Music className="h-4 w-4 text-[#b3b3b3]" /></div>}
                    </div>
                    <div className="min-w-0">
                      <p className={`truncate font-medium ${isCurrent ? 'text-[#dc2626]' : 'text-white'}`}>{track.title}</p>
                      {track.album && <p className="text-xs text-[#b3b3b3] truncate">{track.album.title}</p>}
                    </div>
                    <span className="text-[#b3b3b3] tabular-nums text-xs">{formatDuration(track.duration)}</span>
                  </div>
                );
              })}
            </div>
            {topTracks.length > 5 && (
              <button
                onClick={() => setTracksExpanded(v => !v)}
                className="mt-3 flex items-center gap-1.5 text-sm text-[#b3b3b3] hover:text-white transition-colors font-semibold"
              >
                {tracksExpanded ? <><ChevronUp className="h-4 w-4" /> Weniger anzeigen</> : <><ChevronDown className="h-4 w-4" /> Mehr anzeigen</>}
              </button>
            )}
          </section>
        )}

        {/* ── Diskografie ─────────────────────────────────────── */}
        {albums.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white">Diskografie</h2>
              <Link to={`/music/artists/${id}/discography`} className="text-sm text-[#b3b3b3] hover:text-white font-semibold transition-colors">
                Alle anzeigen
              </Link>
            </div>
            {/* Filter tabs */}
            <div className="flex gap-2 mb-4">
              {([['all', 'Beliebte Veröffentlichungen'], ['album', 'Alben'], ['single_ep', 'Singles und EPs']] as [DiscographyFilter, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setDiscoFilter(val)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    discoFilter === val
                      ? 'bg-white text-black'
                      : 'bg-[#ffffff1a] text-white hover:bg-[#ffffff33]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* Horizontal scroll */}
            <div className="flex gap-5 overflow-x-auto pb-2 scrollbar-hide">
              {filteredAlbums.map(album => (
                <DiscographyCard key={album.id} album={album} />
              ))}
              {filteredAlbums.length === 0 && (
                <p className="text-sm text-[#b3b3b3]">Keine Einträge in dieser Kategorie</p>
              )}
            </div>
          </section>
        )}

        {/* ── Mit [Künstler] ───────────────────────────────────── */}
        {playlists.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white">Mit {artist.name}</h2>
            </div>
            <div className="flex gap-5 overflow-x-auto pb-2 scrollbar-hide">
              {playlists.map(pl => (
                <PlaylistCard key={pl.id} playlist={pl} />
              ))}
            </div>
          </section>
        )}

        {/* ── Musikvideos ─────────────────────────────────────── */}
        {videoTracks.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white">Musikvideos</h2>
            </div>
            <div className="flex gap-5 overflow-x-auto pb-2 scrollbar-hide">
              {videoTracks.map(track => (
                <MusicVideoCard
                  key={track.id}
                  track={track}
                  onPlay={() => setVideoTrackId(track.id)}
                  onDownload={() => downloadVideoMutation.mutate(track.id)}
                  isDownloading={downloadingTrackIds.has(track.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Über den Künstler ────────────────────────────────── */}
        {artist.biography && (
          <section>
            <h2 className="text-2xl font-bold text-white mb-4">Über den Künstler</h2>
            <div className="flex gap-6 items-start">
              {artist.imageUrl && (
                <img
                  src={artist.imageUrl}
                  alt={artist.name}
                  className="h-24 w-24 rounded-lg object-cover shrink-0 hidden sm:block"
                />
              )}
              <div>
                <p
                  className={`text-sm text-[#b3b3b3] leading-relaxed whitespace-pre-line ${!bioExpanded && bioNeedsCollapse ? 'line-clamp-5' : ''}`}
                >
                  {artist.biography}
                </p>
                {bioNeedsCollapse && (
                  <button
                    onClick={() => setBioExpanded(v => !v)}
                    className="mt-2 flex items-center gap-1 text-sm text-white hover:text-[#b3b3b3] transition-colors font-semibold"
                  >
                    {bioExpanded ? <><ChevronUp className="h-4 w-4" /> Weniger</> : <><ChevronDown className="h-4 w-4" /> Mehr anzeigen</>}
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ── Music Video Player Overlay ───────────────────────── */}
      {videoTrack && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl mx-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="min-w-0">
                <p className="text-white font-medium truncate">{videoTrack.title}</p>
                <p className="text-[#b3b3b3] text-sm truncate">{videoTrack.artist?.name}</p>
              </div>
              <button
                onClick={() => setVideoTrackId(null)}
                className="ml-4 flex items-center justify-center h-8 w-8 bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Player */}
            <div className="relative w-full bg-black rounded-lg overflow-hidden" style={{ paddingTop: '56.25%' }}>
              {videoTrack.musicVideoSource === 'local' ? (
                // Local file → native HTML5 video
                <video
                  key={videoTrack.id}
                  className="absolute inset-0 w-full h-full"
                  src={`/api/tracks/${videoTrack.id}/musicvideo/stream`}
                  controls
                  autoPlay
                />
              ) : videoTrack.musicVideoUrl && (() => {
                const m = videoTrack.musicVideoUrl!.match(
                  /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
                );
                return m ? (
                  <iframe
                    key={videoTrack.id}
                    className="absolute inset-0 w-full h-full"
                    src={`https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0`}
                    title={videoTrack.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[#b3b3b3]">
                    <a href={videoTrack.musicVideoUrl!} target="_blank" rel="noopener noreferrer" className="text-sm underline">
                      Im Browser öffnen
                    </a>
                  </div>
                );
              })()}
            </div>

            {/* Download hint when not local */}
            {videoTrack.musicVideoSource !== 'local' && (
              <p className="mt-2 text-xs text-[#b3b3b3] text-center">
                Video nicht verfügbar?{' '}
                <button
                  onClick={() => { downloadVideoMutation.mutate(videoTrack.id); setVideoTrackId(null); }}
                  className="underline hover:text-white transition-colors"
                >
                  Lokal herunterladen
                </button>
              </p>
            )}
          </div>
        </div>
      )}

      {editOpen && (
        <MetadataEditModal
          type="artist"
          id={artist.id}
          initialData={{ name: artist.name, biography: artist.biography ?? '' }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}
