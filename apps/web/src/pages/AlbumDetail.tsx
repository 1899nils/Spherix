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
  Shuffle, MoreHorizontal, Plus, X
} from 'lucide-react';

// Extract dominant color from image data
function extractDominantColor(imageData: ImageData): string {
  const data = imageData.data;
  let r = 0, g = 0, b = 0;
  let count = 0;
  
  // Sample every 10th pixel for performance
  for (let i = 0; i < data.length; i += 40) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count++;
  }
  
  r = Math.floor(r / count);
  g = Math.floor(g / count);
  b = Math.floor(b / count);
  
  // Darken slightly for better text contrast
  return `rgb(${Math.floor(r * 0.7)}, ${Math.floor(g * 0.7)}, ${Math.floor(b * 0.7)})`;
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
  const [bgGradient, setBgGradient] = useState<string>('linear-gradient(to bottom, #525252 0%, #121212 100%)');
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showPlaylistSelector, setShowPlaylistSelector] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['album', id],
    queryFn: () => api.get<ApiResponse<AlbumDetailType>>(`/albums/${id}`),
    enabled: !!id,
  });

  const { 
    playTrack, 
    currentTrack, 
    isPlaying, 
    togglePlay, 
    isShuffled, 
    toggleShuffle 
  } = usePlayerStore();

  const album = data?.data;

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
          const dominantColor = extractDominantColor(imageData);
          
          // Create gradient from dominant color to background
          setBgGradient(`linear-gradient(to bottom, ${dominantColor} 0%, ${dominantColor} 20%, #121212 65%, #121212 100%)`);
        } catch {
          setBgGradient('linear-gradient(to bottom, #525252 0%, #121212 100%)');
        }
      };
      img.onerror = () => setBgGradient('linear-gradient(to bottom, #525252 0%, #121212 100%)');
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
    artistName:   album.artist.name,
    year:         album.year,
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
    artistName:   editTrack.artist.name,
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
  } : {};

  // Get all track IDs for adding to playlist
  const allTrackIds = tracks.map(t => t.id);

  return (
    <div className="min-h-screen -mx-6">
      {/* Spotify-style Header with Dynamic Gradient Background */}
      <div 
        className="relative transition-all duration-700"
        style={{ background: bgGradient }}
      >
        {/* Optional: Blurred cover background overlay for more immersive effect */}
        {album.coverUrl && !coverError && (
          <div 
            className="absolute inset-0 opacity-30 overflow-hidden"
            style={{
              backgroundImage: `url(${album.coverUrl})`,
              backgroundSize: '150% 150%',
              backgroundPosition: 'center',
              filter: 'blur(60px)',
              transform: 'scale(1.2)',
            }}
          />
        )}
        
        {/* Gradient overlay to ensure smooth transition */}
        <div 
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, transparent 0%, transparent 40%, rgba(18, 18, 18, 0.3) 60%, rgba(18, 18, 18, 0.8) 85%, rgba(18, 18, 18, 1) 100%)'
          }}
        />
        
        <div className="relative flex flex-col md:flex-row gap-6 md:gap-8 px-6 md:px-8 py-6 md:py-8 pb-8">
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
                to={`/music/artists/${album.artist.id}`}
                className="font-bold text-white hover:underline"
              >
                {album.artist.name}
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

      {/* Action Bar - on the gradient background */}
      <div 
        className="relative flex items-center gap-4 px-6 md:px-8 py-6 -mt-4 w-full"
        style={{ background: 'linear-gradient(to bottom, transparent 0%, #121212 100%)' }}
      >
        {/* Big Green Play Button */}
        <button
          onClick={isCurrentAlbumPlaying ? togglePlay : handlePlayAll}
          className="h-14 w-14 rounded-full bg-[#dc2626] hover:bg-[#1ed760] hover:scale-105 transition-all flex items-center justify-center shadow-lg"
        >
          {isCurrentAlbumPlaying ? (
            <Pause className="h-7 w-7 text-black fill-black" />
          ) : (
            <Play className="h-7 w-7 text-black fill-black ml-0.5" />
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
              </div>
            </>
          )}
        </div>
      </div>

      {/* Track List - dark background */}
      <div className="px-6 md:px-8 pb-8 bg-[#121212] w-full">
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
            const isCurrent = currentTrack?.id === track.id;
            const showDiscHeader = hasMultipleDiscs &&
              (index === 0 || tracks[index - 1].discNumber !== track.discNumber);

            return (
              <div key={track.id}>
                {showDiscHeader && (
                  <div className="px-4 py-3 text-sm font-semibold text-[#b3b3b3] mt-4 mb-2">
                    Disc {track.discNumber}
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
                        track.trackNumber
                      )}
                    </span>
                    <Play className={`h-4 w-4 hidden group-hover:block ${isCurrent ? 'text-[#dc2626]' : 'text-white'}`} />
                  </span>

                  {/* Title & Artist with Explicit Badge */}
                  <div className="min-w-0 flex flex-col justify-center gap-0.5">
                    <div className="flex items-center gap-2">
                      <p className={`truncate font-normal ${isCurrent ? 'text-[#dc2626]' : 'text-white'}`}>
                        {track.title}
                      </p>
                      {track.explicit && (
                        <span className="flex-shrink-0 inline-flex items-center justify-center h-4 px-1.5 text-[10px] font-bold uppercase bg-[#ffffff1a] text-[#b3b3b3] rounded">
                          E
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#b3b3b3] truncate">
                      {track.artist.name}
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
        <div className="px-6 md:px-8 pb-8 text-xs text-[#b3b3b3] bg-[#121212] w-full">
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
          artistName={album.artist.name}
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
    </div>
  );
}
