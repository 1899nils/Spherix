import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDuration } from '@/lib/utils';
import { usePlayerStore } from '@/stores/playerStore';
import { MediaMetadataEditor } from '@/components/MediaMetadataEditor';
import type { PlaylistWithTracks, PlaylistTrack, ApiResponse } from '@musicserver/shared';
import { 
  Play, Pause, Disc3, Pencil, Clock, Heart, MoreHorizontal, 
  Shuffle, Plus, X
} from 'lucide-react';

// Shuffle array helper
function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// Format relative time (e.g. "vor 5 Min", "vor 2 Std", "vor 3 Tagen")
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 60) {
    return `vor ${diffMins} Min`;
  } else if (diffHours < 24) {
    return `vor ${diffHours} Std`;
  } else {
    return `vor ${diffDays} Tag${diffDays === 1 ? '' : 'en'}`;
  }
}

export function PlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setEditOpen] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [editTrackId, setEditTrackId] = useState<string | null>(null);


  const { data: playlistData, isLoading } = useQuery({
    queryKey: ['playlist', id],
    queryFn: () => api.get<ApiResponse<PlaylistWithTracks>>(`/playlists/${id}`),
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

  const playlist = playlistData?.data;

  // Get dominant color from first track's album cover
  const [bgGradient, setBgGradient] = useState<string>('linear-gradient(to bottom, #525252 0%, #121212 100%)');

  useEffect(() => {
    if (playlist?.tracks?.[0]?.album?.coverUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          canvas.width = 100;
          canvas.height = 100;
          ctx.drawImage(img, 0, 0, 100, 100);
          const imageData = ctx.getImageData(0, 0, 100, 100);
          const data = imageData.data;
          let r = 0, g = 0, b = 0;
          let count = 0;
          for (let i = 0; i < data.length; i += 40) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
          }
          r = Math.floor(r / count * 0.7);
          g = Math.floor(g / count * 0.7);
          b = Math.floor(b / count * 0.7);
          setBgGradient(`linear-gradient(to bottom, rgb(${r},${g},${b}) 0%, rgb(${r},${g},${b}) 20%, #121212 65%, #121212 100%)`);
        } catch {
          setBgGradient('linear-gradient(to bottom, #525252 0%, #121212 100%)');
        }
      };
      img.src = playlist.tracks[0].album.coverUrl;
    }
  }, [playlist?.tracks?.[0]?.album?.coverUrl]);

  if (isLoading) {
    return <div className="text-muted-foreground p-8">Lade Playlist...</div>;
  }

  if (!playlist) {
    return <div className="text-muted-foreground p-8">Playlist nicht gefunden</div>;
  }

  const tracks = playlist.tracks ?? [];
  const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);
  const totalMins = Math.floor(totalDuration / 60);

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      if (isShuffled) {
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

  const isCurrentPlaylistPlaying = currentTrack && tracks.some((t) => t.id === currentTrack.id) && isPlaying;



  return (
    <div className="min-h-screen -mx-6">
      {/* Header with Gradient */}
      <div 
        className="relative transition-all duration-700"
        style={{ background: bgGradient }}
      >
        {/* Gradient overlay */}
        <div 
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, transparent 0%, transparent 40%, rgba(18, 18, 18, 0.3) 60%, rgba(18, 18, 18, 0.8) 85%, rgba(18, 18, 18, 1) 100%)'
          }}
        />
        
        <div className="relative flex flex-col md:flex-row gap-6 md:gap-8 px-6 md:px-8 py-6 md:py-8 pb-8">
          {/* Cover */}
          <div className="h-48 w-48 md:h-56 md:w-56 lg:h-64 lg:w-64 rounded-md overflow-hidden bg-[#282828] shrink-0 shadow-2xl mx-auto md:mx-0">
            {playlist.coverUrl ? (
              <img
                src={playlist.coverUrl}
                alt={playlist.name}
                className="h-full w-full object-cover"
              />
            ) : tracks[0]?.album?.coverUrl ? (
              <img
                src={tracks[0].album.coverUrl}
                alt={playlist.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground bg-[#282828]">
                <Disc3 className="h-24 w-24" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col justify-end gap-3 min-w-0 text-center md:text-left">
            <p className="text-xs uppercase tracking-wider text-white/80 font-medium">
              Playlist
            </p>
            <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold leading-tight line-clamp-2 text-white">
              {playlist.name}
            </h1>
            
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-sm text-white/90">
              <span className="font-bold text-white">Spherix</span>
              <span className="hidden sm:inline">•</span>
              <span>{playlist.trackCount} {playlist.trackCount === 1 ? 'Song' : 'Songs'}</span>
              {totalMins > 0 && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span>{totalMins} Min.</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div 
        className="relative flex items-center gap-4 px-6 md:px-8 py-6 -mt-4 w-full"
        style={{ background: 'linear-gradient(to bottom, transparent 0%, #121212 100%)' }}
      >
        {/* Big Play Button */}
        <button
          onClick={isCurrentPlaylistPlaying ? togglePlay : handlePlayAll}
          className="h-14 w-14 rounded-full bg-[#dc2626] hover:bg-[#ef4444] hover:scale-105 transition-all flex items-center justify-center shadow-lg"
        >
          {isCurrentPlaylistPlaying ? (
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

        {/* More Options */}
        <div className="relative">
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className="h-10 w-10 flex items-center justify-center text-[#b3b3b3] hover:text-white transition-all"
          >
            <MoreHorizontal className="h-7 w-7" />
          </button>

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
                    // TODO: Implement share functionality
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#ffffff1a] transition-colors text-left"
                >
                  <Plus className="h-4 w-4 text-[#b3b3b3]" />
                  <span className="text-white text-sm">Teilen</span>
                </button>

                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    // TODO: Implement delete playlist
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#ffffff1a] transition-colors text-left"
                >
                  <X className="h-4 w-4 text-[#b3b3b3]" />
                  <span className="text-white text-sm text-red-400">Playlist löschen</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Track List */}
      <div className="px-6 md:px-8 pb-8 bg-[#121212] w-full">
        {/* Table Header */}
        <div className="grid grid-cols-[auto_1fr_auto_60px] md:grid-cols-[50px_2fr_1fr_1fr_auto_80px_60px] gap-4 px-4 py-2 text-sm text-[#b3b3b3] border-b border-[#ffffff1a] items-center">
          <span className="w-8 text-center">#</span>
          <span>Titel</span>
          <span className="hidden md:block">Album</span>
          <span className="hidden md:block">Hinzugefügt</span>
          <span className="text-right flex items-center justify-end gap-1">
            <Clock className="h-4 w-4" />
          </span>
          <span className="w-10"></span>
        </div>

        {/* Tracks */}
        <div className="mt-2">
          {tracks.map((track: PlaylistTrack, index: number) => {
            const isCurrent = currentTrack?.id === track.id;

            return (
              <div
                key={track.id}
                className={`group grid grid-cols-[auto_1fr_auto_60px] md:grid-cols-[50px_2fr_1fr_1fr_auto_80px_60px] gap-4 px-4 py-3 text-sm rounded-md hover:bg-[#ffffff1a] cursor-pointer transition-colors items-center ${isCurrent ? 'text-[#dc2626]' : ''}`}
                onClick={() => handlePlayTrack(track)}
              >
                {/* Track Number / Cover / Play Icon */}
                <span className="w-8 text-center text-[#b3b3b3] flex items-center justify-center">
                  <span className={`group-hover:hidden ${isCurrent ? 'text-[#dc2626]' : ''}`}>
                    {isCurrent && isPlaying ? (
                      <span className="text-[#dc2626]">♪</span>
                    ) : (
                      index + 1
                    )}
                  </span>
                  <Play className={`h-4 w-4 hidden group-hover:block ${isCurrent ? 'text-[#dc2626]' : 'text-white'}`} />
                </span>

                {/* Title & Artist */}
                <div className="min-w-0 flex items-center gap-3">
                  {/* Album Cover */}
                  <div className="h-10 w-10 rounded overflow-hidden bg-[#282828] shrink-0">
                    {track.album?.coverUrl ? (
                      <img 
                        src={track.album.coverUrl} 
                        alt="" 
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <Disc3 className="h-5 w-5 text-[#b3b3b3]" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className={`truncate font-normal ${isCurrent ? 'text-[#dc2626]' : 'text-white'}`}>
                      {track.title}
                    </p>
                    <Link
                      to={`/music/artists/${track.artist.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-[#b3b3b3] hover:text-white hover:underline truncate block"
                    >
                      {track.artist.name}
                    </Link>
                  </div>
                </div>

                {/* Album */}
                <div className="hidden md:block min-w-0">
                  <Link 
                    to={`/music/albums/${track.album?.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[#b3b3b3] hover:text-white hover:underline truncate block"
                  >
                    {track.album?.title || '-'}
                  </Link>
                </div>

                {/* Added At */}
                <div className="hidden md:block min-w-0">
                  <span className="text-[#b3b3b3] text-xs">
                    {formatRelativeTime(track.addedAt)}
                  </span>
                </div>

                {/* Duration */}
                <span className="text-[#b3b3b3] text-right tabular-nums">
                  {formatDuration(track.duration)}
                </span>

                {/* Options */}
                <div className="w-10 flex items-center justify-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTrackId(track.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-[#b3b3b3] hover:text-white"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })

          {tracks.length === 0 && (
            <div className="text-center py-12 text-[#b3b3b3]">
              <Disc3 className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Diese Playlist ist leer</p>
              <p className="text-sm">Füge Songs hinzu, um loszulegen</p>
            </div>
          )}
        </div>
      </div>

      {/* Track Metadata Editor */}
      {editTrackId && (
        <MediaMetadataEditor
          isOpen={!!editTrackId}
          onClose={() => setEditTrackId(null)}
          type="track"
          id={editTrackId}
          initialData={(() => {
            const track = tracks.find((t) => t.id === editTrackId);
            return track ? {
              title: track.title,
              artistName: track.artist.name,
              trackNumber: track.trackNumber,
              discNumber: track.discNumber,
              lyrics: track.lyrics,
              explicit: track.explicit,
              format: track.format,
              bitrate: track.bitrate,
              sampleRate: track.sampleRate,
              channels: track.channels,
              duration: track.duration,
              fileSize: track.fileSize,
              filePath: track.filePath,
              musicbrainzId: track.musicbrainzId,
            } : {};
          })()}
        />
      )}
    </div>
  );
}
