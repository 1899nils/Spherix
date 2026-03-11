import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDuration } from '@/lib/utils';
import { usePlayerStore } from '@/stores/playerStore';
import { MediaMetadataEditor } from '@/components/MediaMetadataEditor';
import { MusicBrainzLinkModal } from '@/components/MusicBrainzLinkModal';
import type { AlbumDetail as AlbumDetailType, ApiResponse, TrackWithRelations, Playlist } from '@musicserver/shared';
import {
  Play, Pause, Disc3, Pencil, ExternalLink, Heart, Clock,
  Shuffle, MoreHorizontal, Plus, X, Video, Link2, SkipBack, SkipForward, Download, Loader2
} from 'lucide-react';

// Extract dominant color — weighted towards saturated, mid-tone pixels for a vibrant result
function extractDominantColor(imageData: ImageData): string {
  const data = imageData.data;
  let wR = 0, wG = 0, wB = 0, wTotal = 0;

  for (let i = 0; i < data.length; i += 20) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 510;
    const saturation = max === 0 ? 0 : (max - min) / max;
    // Prefer moderately bright, saturated pixels; de-emphasise near-white/near-black
    const weight = lightness > 0.06 && lightness < 0.92 ? 1 + saturation * 4 : 0.1;
    wR += r * weight; wG += g * weight; wB += b * weight; wTotal += weight;
  }

  const r = Math.floor(wR / wTotal);
  const g = Math.floor(wG / wTotal);
  const b = Math.floor(wB / wTotal);

  // Moderate darkening so white text stays readable
  return `rgb(${Math.floor(r * 0.58)}, ${Math.floor(g * 0.58)}, ${Math.floor(b * 0.58)})`;
}

// Shuffle array helper
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// Playlist Selector Dialog
function PlaylistSelectorDialog({
  isOpen,
  onClose,
  trackIds,
}: {
  isOpen: boolean;
  onClose: () => void;
  trackIds: string[];
}) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data: playlistsData } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => api.get<ApiResponse<Playlist[]>>('/playlists'),
    enabled: isOpen,
  });

  const addToPlaylistMutation = useMutation({
    mutationFn: ({ playlistId, trackIds }: { playlistId: string; trackIds: string[] }) =>
      api.post(`/playlists/${playlistId}/tracks`, { trackIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      setSuccessMessage('Tracks hinzugefügt!');
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1500);
    },
  });

  const createPlaylistMutation = useMutation({
    mutationFn: (name: string) => api.post('/playlists', { name, trackIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      setSuccessMessage('Playlist erstellt!');
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1500);
    },
  });

  const playlists = playlistsData?.data || [];
  const filteredPlaylists = playlists.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-[#282828] rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#ffffff1a]">
          <h2 className="text-base font-semibold text-white">Zu Playlist hinzufügen</h2>
          <button onClick={onClose} className="text-[#b3b3b3] hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="px-4 py-2 bg-[#dc2626]/20 text-[#dc2626] text-sm text-center">
            {successMessage}
          </div>
        )}

        {/* Search */}
        <div className="p-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Playlist suchen"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#3e3e3e] text-white placeholder-[#b3b3b3] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </div>
        </div>

        {/* New Playlist Button */}
        <button
          onClick={() => {
            const name = prompt('Name der neuen Playlist:');
            if (name?.trim()) {
              createPlaylistMutation.mutate(name.trim());
            }
          }}
          className="flex items-center gap-3 px-4 py-3 hover:bg-[#ffffff1a] transition-colors text-left"
        >
          <div className="h-10 w-10 rounded bg-[#3e3e3e] flex items-center justify-center">
            <Plus className="h-5 w-5 text-[#b3b3b3]" />
          </div>
          <span className="text-white text-sm font-medium">Neue Playlist</span>
        </button>

        {/* Playlist List */}
        <div className="flex-1 overflow-y-auto">
          {filteredPlaylists.map((playlist) => (
            <button
              key={playlist.id}
              onClick={() => addToPlaylistMutation.mutate({ playlistId: playlist.id, trackIds })}
              disabled={addToPlaylistMutation.isPending}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#ffffff1a] transition-colors text-left"
            >
              <div className="h-10 w-10 rounded bg-[#3e3e3e] flex items-center justify-center overflow-hidden">
                {playlist.coverUrl ? (
                  <img src={playlist.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Disc3 className="h-5 w-5 text-[#b3b3b3]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{playlist.name}</p>
                <p className="text-[#b3b3b3] text-xs">
                  {playlist.trackCount} {playlist.trackCount === 1 ? 'Song' : 'Songs'}
                </p>
              </div>
              {addToPlaylistMutation.isPending && 
                addToPlaylistMutation.variables?.playlistId === playlist.id && (
                <div className="h-4 w-4 border-2 border-[#dc2626] border-t-transparent rounded-full animate-spin" />
              )}
            </button>
          ))}

          {filteredPlaylists.length === 0 && (
            <div className="px-4 py-6 text-center text-[#b3b3b3] text-sm">
              Keine Playlists gefunden
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AlbumDetail() {
  const { id } = useParams<{ id: string }>();
  const [editOpen, setEditOpen] = useState(false);
  const [mbOpen, setMbOpen] = useState(false);
  const [editTrackId, setEditTrackId] = useState<string | null>(null);
  const [coverError, setCoverError] = useState(false);
  const [headerBgColor, setHeaderBgColor] = useState<string>('#383838');
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showPlaylistSelector, setShowPlaylistSelector] = useState(false);
  const [videoTrackId, setVideoTrackId] = useState<string | null>(null);
  const [videoQueue, setVideoQueue] = useState<TrackWithRelations[]>([]);
  const [videoQueueIndex, setVideoQueueIndex] = useState(0);
  const [downloadingVideoIds, setDownloadingVideoIds] = useState<Set<string>>(new Set());
  const [mvSearchOpen, setMvSearchOpen] = useState(false);
  const [mvSearchResults, setMvSearchResults] = useState<{
    total: number;
    found: number;
    results: Array<{
      trackId: string;
      trackTitle: string;
      found: boolean;
      url?: string;
      source?: string;
    }>;
  } | null>(null);
  const [mvManualInputTrackId, setMvManualInputTrackId] = useState<string | null>(null);
  const [mvManualUrl, setMvManualUrl] = useState('');

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['album', id],
    queryFn: () => api.get<ApiResponse<AlbumDetailType>>(`/albums/${id}`),
    enabled: !!id,
  });

  // Music video search mutation — must be declared before any early returns (Rules of Hooks)
  const mvSearchMutation = useMutation({
    mutationFn: async ({ force = false }: { force?: boolean } = {}) => {
      const response = await api.post<{
        data: {
          total: number;
          found: number;
          results: Array<{
            trackId: string;
            trackTitle: string;
            found: boolean;
            url?: string;
            source?: string;
          }>;
        };
      }>(`/albums/${id}/musicvideo-search`, { force });
      return response.data;
    },
    onSuccess: (data) => {
      setMvSearchResults(data);
      // Refresh album data to get updated video info
      queryClient.invalidateQueries({ queryKey: ['album', id] });
    },
  });

  const mvManualLinkMutation = useMutation({
    mutationFn: ({ trackId, url }: { trackId: string; url: string }) =>
      api.post(`/tracks/${trackId}/musicvideo`, { url, source: 'manual' }),
    onSuccess: (_data, { trackId, url }) => {
      // Update local results list so the row shows as found immediately
      setMvSearchResults(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          found: prev.results.filter(r => r.found || r.trackId === trackId).length,
          results: prev.results.map(r =>
            r.trackId === trackId ? { ...r, found: true, url, source: 'manual' } : r
          ),
        };
      });
      setMvManualInputTrackId(null);
      setMvManualUrl('');
      queryClient.invalidateQueries({ queryKey: ['album', id] });
    },
  });

  const [videoDownloadError, setVideoDownloadError] = useState<string | null>(null);

  const downloadVideoMutation = useMutation({
    mutationFn: (trackId: string) => api.post(`/tracks/${trackId}/musicvideo/download`, {}),
    onMutate: (trackId) => {
      setVideoDownloadError(null);
      setDownloadingVideoIds(prev => new Set(prev).add(trackId));
    },
    onError: (err: Error, trackId) => {
      setDownloadingVideoIds(prev => { const s = new Set(prev); s.delete(trackId); return s; });
      setVideoDownloadError(err.message);
    },
    onSuccess: (_data, trackId) => {
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const res = await api.get<{ data: { source: string } }>(`/tracks/${trackId}/musicvideo/status`);
          if (res.data.source !== 'downloading') {
            clearInterval(interval);
            setDownloadingVideoIds(prev => { const s = new Set(prev); s.delete(trackId); return s; });
            queryClient.invalidateQueries({ queryKey: ['album', id] });
          }
        } catch { /* ignore */ }
        if (attempts >= 120) {
          clearInterval(interval);
          setDownloadingVideoIds(prev => { const s = new Set(prev); s.delete(trackId); return s; });
          queryClient.invalidateQueries({ queryKey: ['album', id] });
        }
      }, 5000);
    },
  });

  const {
    playTrack,
    currentTrack,
    isPlaying,
    togglePlay,
    isShuffled,
    toggleShuffle,
    queue: playerQueue,
    pause: pauseAudio,
  } = usePlayerStore();

  const album = data?.data;

  // Build and open the video queue starting at a specific track
  const openVideoQueue = (clickedTrackId: string, albumTracks: TrackWithRelations[]) => {
    const albumTrackIds = new Set(albumTracks.map(t => t.id));
    const queueAlbumTracks = playerQueue.filter(
      (t): t is TrackWithRelations => 'id' in t && albumTrackIds.has(t.id)
    );
    const orderedTracks = queueAlbumTracks.length > 0 ? queueAlbumTracks : albumTracks;
    const withVideo = orderedTracks.filter(t => t.musicVideoUrl);
    const idx = withVideo.findIndex(t => t.id === clickedTrackId);
    setVideoQueue(withVideo);
    setVideoQueueIndex(idx >= 0 ? idx : 0);
    setVideoTrackId(clickedTrackId);
    pauseAudio();
  };

  // Listen for YouTube postMessage events to auto-advance the video queue
  useEffect(() => {
    if (!videoTrackId) return;
    const handleMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const msg = JSON.parse(event.data) as { event?: string; info?: number };
        // YouTube state 0 = ended
        if (msg.event === 'onStateChange' && msg.info === 0) {
          setVideoQueueIndex(prev => {
            const next = prev + 1;
            if (next >= videoQueue.length) {
              setVideoTrackId(null);
              return 0;
            }
            setVideoTrackId(videoQueue[next].id);
            return next;
          });
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [videoTrackId, videoQueue]);

  // Extract dominant color when cover loads
  useEffect(() => {
    if (album?.coverUrl && !coverError && coverLoaded) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          
          // Resize for performance
          canvas.width = 100;
          canvas.height = 100;
          ctx.drawImage(img, 0, 0, 100, 100);
          
          const imageData = ctx.getImageData(0, 0, 100, 100);
          setHeaderBgColor(extractDominantColor(imageData));
        } catch {
          setHeaderBgColor('#383838');
        }
      };
      img.onerror = () => setHeaderBgColor('#383838');
      img.src = album.coverUrl;
    }
  }, [album?.coverUrl, coverError, coverLoaded]);

  if (isLoading) {
    return <div className="text-muted-foreground p-8">Lade Album...</div>;
  }

  if (!album) {
    return <div className="text-muted-foreground p-8">Album nicht gefunden</div>;
  }

  const tracks = album.tracks ?? [];
  const totalDuration = tracks.reduce((sum: number, t: TrackWithRelations) => sum + t.duration, 0);
  const totalMins = Math.floor(totalDuration / 60);

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      if (isShuffled) {
        // Play shuffled
        const shuffledTracks = shuffleArray(tracks);
        playTrack(shuffledTracks[0], shuffledTracks);
      } else {
        playTrack(tracks[0], tracks);
      }
    }
  };

  const handlePlayTrack = (track: TrackWithRelations) => {
    playTrack(track, tracks);
  };

  const isCurrentAlbumPlaying = currentTrack && tracks.some((t: TrackWithRelations) => t.id === currentTrack.id) && isPlaying;

  // Group tracks by disc if multi-disc
  const hasMultipleDiscs = new Set(tracks.map((t: TrackWithRelations) => t.discNumber)).size > 1;

  // Build initialData for the album editor
  const albumEditorData = {
    title:        album.title,
    artistName:   album.artist?.name ?? '',
    year:         album.year,
    releaseDate:  album.releaseDate,
    releaseType:  album.releaseType,
    genre:        album.genre,
    label:        album.label,
    country:      album.country,
    coverUrl:     album.coverUrl,
    totalTracks:  album.totalTracks,
    totalDiscs:   album.totalDiscs,
    musicbrainzId: album.musicbrainzId,
  };

  // Build initialData for the selected track editor
  const editTrack = editTrackId ? tracks.find((t: TrackWithRelations) => t.id === editTrackId) : null;
  const trackEditorData = editTrack ? {
    title:        editTrack.title,
    artistName:   editTrack.artist?.name ?? '',
    trackNumber:  editTrack.trackNumber,
    discNumber:   editTrack.discNumber,
    lyrics:       editTrack.lyrics,
    explicit:     editTrack.explicit,
    format:       editTrack.format,
    bitrate:      editTrack.bitrate,
    sampleRate:   editTrack.sampleRate,
    channels:     editTrack.channels,
    duration:     editTrack.duration,
    fileSize:     editTrack.fileSize,
    filePath:     editTrack.filePath,
    musicbrainzId: editTrack.musicbrainzId,
    musicVideoUrl: editTrack.musicVideoUrl,
    musicVideoSource: editTrack.musicVideoSource,
  } : {};

  // Get all track IDs for adding to playlist
  const allTrackIds = tracks.map(t => t.id);

  return (
    <div className="min-h-screen bg-[#121212]">
      {/* Header — solid dominant-color background, covers only the cover+info area */}
      <div
        className="relative -mx-6 transition-colors duration-700"
        style={{ backgroundColor: headerBgColor }}
      >
        {/* Blurred cover overlay for depth */}
        {album.coverUrl && !coverError && (
          <div
            className="absolute inset-0 opacity-20 overflow-hidden"
            style={{
              backgroundImage: `url(${album.coverUrl})`,
              backgroundSize: '150% 150%',
              backgroundPosition: 'center',
              filter: 'blur(50px)',
              transform: 'scale(1.3)',
            }}
          />
        )}

        {/* Gradient overlay: fades to #121212 at the bottom of the cover section */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.15) 50%, rgba(18,18,18,0.75) 80%, rgb(18,18,18) 100%)'
          }}
        />

        {/* Cover + Album Info */}
        <div className="relative flex flex-col md:flex-row gap-6 md:gap-8 px-6 md:px-8 py-8 md:py-10 pb-8">
          {/* Large Cover */}
          <div className="h-48 w-48 md:h-56 md:w-56 lg:h-64 lg:w-64 rounded-md overflow-hidden bg-[#282828] shrink-0 shadow-2xl mx-auto md:mx-0">
            {album.coverUrl && !coverError ? (
              <img
                src={album.coverUrl}
                alt={album.title}
                className="h-full w-full object-cover"
                onError={() => setCoverError(true)}
                onLoad={() => setCoverLoaded(true)}
                crossOrigin="anonymous"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground bg-[#282828]">
                <Disc3 className="h-24 w-24" />
              </div>
            )}
          </div>

          {/* Album Info */}
          <div className="flex flex-col justify-end gap-3 min-w-0 text-center md:text-left">
            <p className="text-xs uppercase tracking-wider text-white/80 font-medium">
              Album
            </p>
            <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold leading-tight line-clamp-2 text-white">
              {album.title}
            </h1>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-sm text-white/90">
              <Link
                to={`/music/artists/${album.artist?.id}`}
                className="font-bold text-white hover:underline"
              >
                {album.artist?.name}
              </Link>
              {album.year && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span>{album.year}</span>
                </>
              )}
              <span className="hidden sm:inline">•</span>
              <span>{tracks.length} {tracks.length === 1 ? 'Song' : 'Songs'}</span>
              <span className="hidden sm:inline">•</span>
              <span>{totalMins} Min.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar — solid #121212, no gradient, below the color break */}
      <div className="flex items-center gap-4 px-6 md:px-8 py-6 -mx-6 bg-[#121212]">
          {/* Play Button */}
          <button
            onClick={isCurrentAlbumPlaying ? togglePlay : handlePlayAll}
            className="h-14 w-14 rounded-full bg-[#dc2626] hover:bg-[#b91c1c] hover:scale-105 transition-all flex items-center justify-center shadow-lg"
          >
            {isCurrentAlbumPlaying ? (
              <Pause className="h-7 w-7 text-white fill-white" />
            ) : (
              <Play className="h-7 w-7 text-white fill-white ml-0.5" />
            )}
          </button>

          {/* Shuffle Button */}
          <button
            onClick={toggleShuffle}
            title={isShuffled ? 'Zufallswiedergabe aus' : 'Zufallswiedergabe an'}
            className={`h-10 w-10 flex items-center justify-center transition-all ${
              isShuffled
                ? 'text-[#dc2626]'
                : 'text-[#b3b3b3] hover:text-white hover:scale-105'
            }`}
          >
            <Shuffle className="h-6 w-6" />
          </button>

          {/* Heart Button */}
          <button className="h-10 w-10 flex items-center justify-center text-[#b3b3b3] hover:text-white hover:scale-105 transition-all">
            <Heart className="h-7 w-7" />
          </button>

          {/* More Options Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="h-10 w-10 flex items-center justify-center text-[#b3b3b3] hover:text-white transition-all"
            >
              <MoreHorizontal className="h-7 w-7" />
            </button>

            {/* Dropdown Menu */}
            {showMoreMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowMoreMenu(false)}
                />
                <div className="absolute top-full left-0 mt-1 w-64 bg-[#282828] rounded-md shadow-xl py-1 z-50">
                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      setEditOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#ffffff1a] transition-colors text-left"
                  >
                    <Pencil className="h-4 w-4 text-[#b3b3b3]" />
                    <span className="text-white text-sm">Bearbeiten</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowPlaylistSelector(true);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#ffffff1a] transition-colors text-left"
                  >
                    <Plus className="h-4 w-4 text-[#b3b3b3]" />
                    <span className="text-white text-sm">Zu Playlist hinzufügen</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      setMbOpen(true);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#ffffff1a] transition-colors text-left"
                  >
                    <ExternalLink className="h-4 w-4 text-[#b3b3b3]" />
                    <span className="text-white text-sm">MusicBrainz</span>
                    {album.musicbrainzId && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-[#dc2626]" />
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      setMvSearchOpen(true);
                      mvSearchMutation.mutate({});
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#ffffff1a] transition-colors text-left"
                  >
                    <Video className="h-4 w-4 text-[#b3b3b3]" />
                    <span className="text-white text-sm">Musikvideos suchen</span>
                    {tracks.some(t => t.musicVideoUrl) && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-[#dc2626]" />
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

      {/* Track List */}
      <div className="px-6 md:px-8 pb-8 -mx-6">
        {/* Table Header */}
        <div className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[50px_1fr_auto_auto] gap-4 px-4 py-2 text-sm text-[#b3b3b3] border-b border-[#ffffff1a]">
          <span className="w-8 text-center">#</span>
          <span>Titel</span>
          <span className="hidden md:block text-right w-24"></span>
          <span className="text-right flex items-center justify-end gap-1">
            <Clock className="h-4 w-4" />
          </span>
        </div>

        {/* Tracks */}
        <div className="mt-2">
          {tracks.map((track: TrackWithRelations, index: number) => {
            if (!track || !track.id) return null;
            
            const isCurrent = currentTrack?.id === track.id;
            const showDiscHeader = hasMultipleDiscs &&
              (index === 0 || tracks[index - 1]?.discNumber !== track.discNumber);

            return (
              <div key={track.id}>
                {showDiscHeader && (
                  <div className="px-4 py-3 text-sm font-semibold text-[#b3b3b3] mt-4 mb-2">
                    Disc {track.discNumber ?? 1}
                  </div>
                )}
                <div
                  className={`group grid grid-cols-[auto_1fr_auto] md:grid-cols-[50px_1fr_auto_auto] gap-4 px-4 py-3 text-sm rounded-md hover:bg-[#ffffff1a] cursor-pointer transition-colors ${isCurrent ? 'text-[#dc2626]' : ''}`}
                  onClick={() => handlePlayTrack(track)}
                >
                  {/* Track Number / Play Icon */}
                  <span className="w-8 text-center text-[#b3b3b3] flex items-center justify-center">
                    <span className={`group-hover:hidden ${isCurrent ? 'text-[#dc2626]' : ''}`}>
                      {isCurrent && isPlaying ? (
                        <span className="text-[#dc2626]">♪</span>
                      ) : (
                        track.trackNumber ?? '-'
                      )}
                    </span>
                    <Play className={`h-4 w-4 hidden group-hover:block ${isCurrent ? 'text-[#dc2626]' : 'text-white'}`} />
                  </span>

                  {/* Title & Artist with Explicit Badge & Video */}
                  <div className="min-w-0 flex flex-col justify-center gap-0.5">
                    <div className="flex items-center gap-2">
                      <p className={`truncate font-normal ${isCurrent ? 'text-[#dc2626]' : 'text-white'}`}>
                        {track.title ?? 'Unknown Title'}
                      </p>
                      {track.explicit && (
                        <span className="flex-shrink-0 inline-flex items-center justify-center h-4 px-1.5 text-[10px] font-bold uppercase bg-[#ffffff1a] text-[#b3b3b3] rounded">
                          E
                        </span>
                      )}
                      {track.musicVideoUrl && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openVideoQueue(track.id, tracks); }}
                          className="flex-shrink-0 inline-flex items-center justify-center h-4 w-4 bg-[#ffffff1a] text-[#b3b3b3] hover:text-white hover:bg-[#ffffff33] rounded transition-colors"
                          title="Musikvideo abspielen"
                        >
                          <Video className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-[#b3b3b3] truncate">
                      {track.artist?.name ?? 'Unknown Artist'}
                    </p>
                  </div>

                  {/* Edit Button (desktop) */}
                  <button
                    className="hidden md:flex w-24 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-end"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTrackId(track.id);
                    }}
                    title="Track bearbeiten"
                  >
                    <Pencil className="h-3.5 w-3.5 text-[#b3b3b3] hover:text-white" />
                  </button>

                  {/* Duration */}
                  <span className="text-[#b3b3b3] text-right self-center tabular-nums">
                    {formatDuration(track.duration)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Album Info Footer */}
      {(album.label || album.country || album.genre) && (
        <div className="px-6 md:px-8 pb-8 text-xs text-[#b3b3b3] -mx-6">
          <div className="pt-6 border-t border-[#ffffff1a] space-y-1">
            {album.year && <p><span className="text-white">{album.year}</span> veröffentlicht</p>}
            {album.label && <p>Label: {album.label}</p>}
            {album.country && <p>Land: {album.country}</p>}
            {album.genre && <p>Genre: {album.genre}</p>}
          </div>
        </div>
      )}

      {/* Album Metadata Editor */}
      {editOpen && id && (
        <MediaMetadataEditor
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          type="album"
          id={id}
          initialData={albumEditorData}
          onOpenMusicBrainz={() => {
            setEditOpen(false);
            setMbOpen(true);
          }}
        />
      )}

      {/* Track Metadata Editor */}
      {editTrackId && editTrack && (
        <MediaMetadataEditor
          isOpen={!!editTrackId}
          onClose={() => setEditTrackId(null)}
          type="track"
          id={editTrackId}
          initialData={trackEditorData}
        />
      )}

      {/* MusicBrainz Link Modal */}
      {mbOpen && (
        <MusicBrainzLinkModal
          albumId={album.id}
          albumTitle={album.title}
          artistName={album.artist?.name ?? ''}
          musicbrainzId={album.musicbrainzId}
          onClose={() => setMbOpen(false)}
        />
      )}

      {/* Playlist Selector */}
      <PlaylistSelectorDialog
        isOpen={showPlaylistSelector}
        onClose={() => setShowPlaylistSelector(false)}
        trackIds={allTrackIds}
      />

      {/* Music Video Search Dialog */}
      {mvSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMvSearchOpen(false)} />
          <div className="relative bg-[#282828] rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded bg-red-600/20 flex items-center justify-center">
                  <Video className="h-4 w-4 text-red-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Musikvideos suchen</h2>
                  <p className="text-xs text-[#b3b3b3]">{album.title}</p>
                </div>
              </div>
              <button
                onClick={() => setMvSearchOpen(false)}
                className="text-[#b3b3b3] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {mvSearchMutation.isPending ? (
                <div className="flex items-center justify-center py-12 gap-3 text-[#b3b3b3]">
                  <div className="h-5 w-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                  <span>Suche läuft...</span>
                </div>
              ) : mvSearchMutation.isError ? (
                <div className="text-center py-12 space-y-3">
                  <Video className="h-12 w-12 mx-auto opacity-50 text-red-400" />
                  <p className="text-sm text-red-400 font-medium">Suche fehlgeschlagen</p>
                  <p className="text-xs text-[#b3b3b3] max-w-sm mx-auto">
                    {mvSearchMutation.error instanceof Error
                      ? mvSearchMutation.error.message
                      : 'Ein unbekannter Fehler ist aufgetreten.'}
                  </p>
                </div>
              ) : mvSearchResults ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[#b3b3b3]">
                      {mvSearchResults.found} von {mvSearchResults.total} gefunden
                    </span>
                    <button
                      onClick={() => mvSearchMutation.mutate({ force: true })}
                      className="text-xs text-red-400 hover:text-red-300"
                      disabled={mvSearchMutation.isPending}
                    >
                      Erneut suchen
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {mvSearchResults.results.map((result) => (
                      <div
                        key={result.trackId}
                        className="flex flex-col gap-2 p-3 rounded bg-white/5"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`h-2 w-2 flex-shrink-0 rounded-full ${result.found ? 'bg-green-500' : 'bg-gray-500'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{result.trackTitle}</p>
                            {result.found && result.source && (
                              <p className="text-xs text-[#b3b3b3]">
                                {result.source === 'manual' ? 'Manuell verknüpft' :
                                 result.source === 'youtube' ? 'YouTube' :
                                 result.source === 'musicbrainz' ? 'MusicBrainz' : result.source}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {result.found && result.url && (
                              <a
                                href={result.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-red-400 hover:text-red-300"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Öffnen
                              </a>
                            )}
                            <button
                              onClick={() => {
                                setMvManualInputTrackId(
                                  mvManualInputTrackId === result.trackId ? null : result.trackId
                                );
                                setMvManualUrl('');
                              }}
                              className="flex items-center gap-1 text-xs text-[#b3b3b3] hover:text-white"
                              title="URL manuell eingeben"
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {mvManualInputTrackId === result.trackId && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (mvManualUrl.trim()) {
                                mvManualLinkMutation.mutate({ trackId: result.trackId, url: mvManualUrl.trim() });
                              }
                            }}
                            className="flex gap-2"
                          >
                            <input
                              type="url"
                              value={mvManualUrl}
                              onChange={(e) => setMvManualUrl(e.target.value)}
                              placeholder="https://www.youtube.com/watch?v=..."
                              className="flex-1 bg-white/10 text-white text-xs rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-red-500 placeholder-[#b3b3b3]"
                              autoFocus
                            />
                            <button
                              type="submit"
                              disabled={!mvManualUrl.trim() || mvManualLinkMutation.isPending}
                              className="text-xs px-2 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded"
                            >
                              Speichern
                            </button>
                          </form>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-12 gap-3 text-[#b3b3b3]">
                  <div className="h-5 w-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                  <span>Suche läuft...</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-white/10">
              <button
                onClick={() => setMvSearchOpen(false)}
                className="w-full py-2 bg-white/10 hover:bg-white/20 text-white rounded text-sm transition-colors"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Music Video Player */}
      {videoTrackId && (() => {
        const vTrack = videoQueue[videoQueueIndex] ?? tracks.find((t: TrackWithRelations) => t.id === videoTrackId);
        if (!vTrack) return null;

        const isLocal = vTrack.musicVideoSource === 'local';
        const isDownloading = downloadingVideoIds.has(vTrack.id) || vTrack.musicVideoSource === 'downloading';
        const hasPrev = videoQueueIndex > 0;
        const hasNext = videoQueueIndex < videoQueue.length - 1;

        const goPrev = () => { const idx = videoQueueIndex - 1; setVideoQueueIndex(idx); setVideoTrackId(videoQueue[idx].id); };
        const goNext = () => { const idx = videoQueueIndex + 1; setVideoQueueIndex(idx); setVideoTrackId(videoQueue[idx].id); };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="relative w-full max-w-3xl mx-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button onClick={goPrev} disabled={!hasPrev} className="flex-shrink-0 flex items-center justify-center h-8 w-8 bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded transition-colors">
                    <SkipBack className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">{vTrack.title}</p>
                    <p className="text-[#b3b3b3] text-xs truncate">
                      {vTrack.artist?.name}
                      {videoQueue.length > 1 && <span className="ml-2 text-[#666]">{videoQueueIndex + 1} / {videoQueue.length}</span>}
                    </p>
                  </div>
                  <button onClick={goNext} disabled={!hasNext} className="flex-shrink-0 flex items-center justify-center h-8 w-8 bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded transition-colors">
                    <SkipForward className="h-4 w-4" />
                  </button>
                </div>
                <button onClick={() => setVideoTrackId(null)} className="ml-4 flex items-center justify-center h-8 w-8 bg-white/10 hover:bg-white/20 text-white rounded transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Player area */}
              <div className="relative w-full bg-[#181818] rounded-lg overflow-hidden" style={{ paddingTop: '56.25%' }}>
                {isLocal ? (
                  <video
                    key={vTrack.id}
                    className="absolute inset-0 w-full h-full"
                    src={`/api/tracks/${vTrack.id}/musicvideo/stream`}
                    controls
                    autoPlay
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-[#b3b3b3]">
                    <Video className="h-10 w-10 opacity-40" />
                    <p className="text-sm">Video noch nicht heruntergeladen</p>
                    <button
                      onClick={() => { setVideoDownloadError(null); downloadVideoMutation.mutate(vTrack.id); }}
                      disabled={isDownloading}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-full text-sm font-semibold hover:bg-[#ddd] disabled:opacity-60 transition-colors"
                    >
                      {isDownloading
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Wird heruntergeladen...</>
                        : <><Download className="h-4 w-4" /> Herunterladen</>}
                    </button>
                    {videoDownloadError && (
                      <p className="text-xs text-red-400 max-w-xs text-center">{videoDownloadError}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
