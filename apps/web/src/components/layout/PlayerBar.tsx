import { useState, useCallback, useEffect, useRef } from 'react';
import { usePlayerStore, type RadioStation, type PodcastEpisodePlayerItem } from '@/stores/playerStore';
import { useAudiobookPlayerStore } from '@/stores/audiobookPlayerStore';
import { useVideoPlayerStore } from '@/stores/videoPlayerStore';
import { useSectionStore } from '@/stores/sectionStore';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDuration, cn } from '@/lib/utils';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  ChevronUp, Square, Film, Shuffle
} from 'lucide-react';

// ── Shared Volume Control ─────────────────────────────────────────────────────

function VolumeControl({ 
  volume, 
  isMuted, 
  onToggleMute, 
  onChange 
}: { 
  volume: number; 
  isMuted: boolean; 
  onToggleMute: () => void;
  onChange: (v: number) => void;
}) {
  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  
  return (
    <div className="flex items-center gap-2">
      <button onClick={onToggleMute} className="text-white/80 hover:text-white p-2">
        <VolumeIcon className="h-5 w-5" />
      </button>
      <div className="relative w-24 h-1 bg-white/30 rounded overflow-hidden">
        <div 
          className="absolute h-full bg-red-600"
          style={{ width: `${isMuted ? 0 : volume * 100}%` }}
        />
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={isMuted ? 0 : volume}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}

// ── Progress Bar Component (Draggable with Handle) ────────────────────────────

function ProgressBar({ progress, onSeek }: { progress: number; onSeek?: (percent: number) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(progress);
  const barRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const onSeekRef = useRef(onSeek);

  // Keep refs in sync
  useEffect(() => {
    onSeekRef.current = onSeek;
    if (!isDragging) {
      setDragProgress(progress);
    }
  }, [progress, onSeek, isDragging]);

  const calculatePercent = useCallback((clientX: number) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    const percent = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, percent));
  }, []);

  // Handle mouse events with refs to avoid re-creating listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const percent = calculatePercent(e.clientX);
      setDragProgress(percent * 100);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);
      const percent = calculatePercent(e.clientX);
      onSeekRef.current?.(percent);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, calculatePercent]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!onSeek) return;
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    setIsDragging(true);
    const percent = calculatePercent(e.clientX);
    setDragProgress(percent * 100);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!onSeek || isDraggingRef.current) return;
    const percent = calculatePercent(e.clientX);
    onSeek(percent);
  };

  const displayProgress = isDragging ? dragProgress : progress;

  return (
    <div 
      ref={barRef}
      className="absolute top-0 left-0 right-0 h-4 -mt-1.5 cursor-pointer group"
      onClick={handleClick}
    >
      {/* Track background */}
      <div className="absolute top-1.5 left-0 right-0 h-1 bg-white/20 rounded-full" />
      
      {/* Filled progress - no transition while dragging for instant response */}
      <div 
        className={cn(
          "absolute top-1.5 left-0 h-1 bg-red-600 rounded-full",
          !isDragging && "transition-all duration-150"
        )}
        style={{ width: `${displayProgress}%` }}
      />
      
      {/* Draggable Handle */}
      {onSeek && (
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg transition-opacity duration-200 hover:scale-110",
            isDragging ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
          style={{ left: `calc(${displayProgress}% - 8px)` }}
          onMouseDown={handleMouseDown}
        >
          <div className="absolute inset-1 bg-red-600 rounded-full" />
        </div>
      )}
    </div>
  );
}

// ── Music Player Bar ──────────────────────────────────────────────────────────

function MusicPlayerBar() {
  const {
    currentTrack, isPlaying, seek, duration, volume, isMuted, isShuffled, currentRadioTrack,
    togglePlay, next, prev, seekTo, setVolume, toggleMute, stop, toggleShuffle
  } = usePlayerStore();

  const isRadio = !!(currentTrack && 'isRadio' in currentTrack);
  const isPodcast = !!(currentTrack && 'isPodcast' in currentTrack);
  const progress = duration > 0 ? (seek / duration) * 100 : 0;

  const getArtistName = () => {
    if (!currentTrack) return '';
    if (isRadio) {
      // Show current track artist if available from ICY metadata
      if (currentRadioTrack?.artist) {
        return currentRadioTrack.artist;
      }
      return 'Live Radio';
    }
    if (isPodcast) return (currentTrack as PodcastEpisodePlayerItem).podcastTitle;
    return (currentTrack as any).artist?.name || 'Unknown';
  };

  const getTrackTitle = () => {
    if (!currentTrack) return '';
    if (isRadio && currentRadioTrack?.title) {
      return currentRadioTrack.title;
    }
    return isRadio ? (currentTrack as RadioStation).name : currentTrack.title;
  };

  const handleSeek = (percent: number) => {
    if (duration && seekTo) {
      seekTo(percent * duration);
    }
  };

  if (!currentTrack) return null;

  return (
    <div className="relative w-full h-full flex items-center px-4">
      <ProgressBar progress={progress} onSeek={handleSeek} />
      
      {/* Left: Info */}
      <div className="flex items-center gap-4 w-[30%] pl-2">
        <div className="h-14 w-14 rounded-lg bg-black overflow-hidden shrink-0 ring-2 ring-white/10 shadow-lg">
          {'isRadio' in currentTrack ? (
            currentTrack.favicon ? (
              <img src={currentTrack.favicon} alt="" className="h-full w-full object-contain p-1" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-lg">📻</div>
            )
          ) : 'isPodcast' in currentTrack ? (
            (currentTrack as PodcastEpisodePlayerItem).imageUrl ? (
              <img src={(currentTrack as PodcastEpisodePlayerItem).imageUrl!} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-lg">🎙️</div>
            )
          ) : (
            currentTrack.album?.coverUrl ? (
              <img src={currentTrack.album.coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-white/30">♪</div>
            )
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {getTrackTitle()}
          </p>
          <p className="text-xs text-white/50 truncate">
            {getArtistName()}
          </p>
          <p className="text-xs text-white/50 tabular-nums">
            {isRadio ? (currentRadioTrack ? 'LIVE • ' + (currentTrack as RadioStation).name : 'LIVE') : `${formatDuration(seek)} / ${formatDuration(duration)}`}
          </p>
        </div>
      </div>

      {/* Center: Controls */}
      <div className="flex items-center justify-center gap-2 flex-1">
        {/* Shuffle Button */}
        <button 
          onClick={toggleShuffle}
          title={isShuffled ? 'Zufallswiedergabe aus' : 'Zufallswiedergabe an'}
          className={`p-2 transition-colors ${
            isShuffled 
              ? 'text-red-600 hover:text-red-500' 
              : 'text-white/70 hover:text-white'
          }`}
        >
          <Shuffle className="h-5 w-5" />
        </button>

        <button onClick={prev} className="p-2 text-white/70 hover:text-white">
          <SkipBack className="h-5 w-5" />
        </button>
        
        <button 
          onClick={togglePlay}
          className="flex items-center justify-center w-12 h-12 bg-white text-black rounded-full hover:scale-105 transition-transform"
        >
          {isPlaying 
            ? <Pause className="h-6 w-6 fill-current" />
            : <Play className="h-6 w-6 fill-current ml-0.5" />}
        </button>
        
        <button onClick={next} className="p-2 text-white/70 hover:text-white">
          <SkipForward className="h-5 w-5" />
        </button>

        {/* Stop */}
        <button 
          onClick={(e) => { e.stopPropagation(); stop(); }}
          className="p-2 text-white/70 hover:text-white ml-2"
        >
          <Square className="h-4 w-4 fill-current" />
        </button>
      </div>

      {/* Right: Volume + Last.fm */}
      <div className="flex items-center justify-end w-[30%] gap-3">
        <LastfmIndicator isPlaying={isPlaying} />
        <VolumeControl 
          volume={volume} 
          isMuted={isMuted} 
          onToggleMute={toggleMute}
          onChange={setVolume}
        />
      </div>
    </div>
  );
}

// ── Last.fm Indicator ─────────────────────────────────────────────────────────

interface LastfmStatus {
  connected: boolean;
  username?: string;
}

function LastfmIndicator({ isPlaying }: { isPlaying: boolean }) {
  const { data: lastfmStatus } = useQuery<LastfmStatus>({
    queryKey: ['lastfm-status'],
    queryFn: async () => api.get<LastfmStatus>('/lastfm/status'),
    staleTime: 5 * 60 * 1000,
  });

  const isConnected = lastfmStatus?.connected ?? false;
  const tooltip = isConnected
    ? `Last.fm verbunden als ${lastfmStatus?.username ?? '?'}`
    : 'Last.fm nicht verbunden · Klicken zum Verbinden';

  return (
    <a
      href="/settings?tab=music"
      title={tooltip}
      className={cn(
        'flex items-center justify-center h-8 w-8 rounded-md transition-all hover:scale-110',
        isPlaying && isConnected
          ? 'text-[#d51007]'
          : isConnected
          ? 'text-[#d51007]/50 hover:text-[#d51007]/80'
          : 'text-white/25 hover:text-white/50'
      )}
    >
      {/* Last.fm "as" logo */}
      <svg className="h-5 w-5" viewBox="0 0 70 40" fill="currentColor" aria-label="Last.fm">
        {/* "a" letter */}
        <path d="M18 1C8.5 1 1 8.7 1 20s7.5 19 17 19c5.2 0 9.5-2.1 12.2-5.6v5h7V1h-7v5C27.5 3.1 23.2 1 18 1zm0 30.5c-6.5 0-10-4.6-10-11.5S11.5 8.5 18 8.5s10 4.6 10 11.5-3.5 11.5-10 11.5z"/>
        {/* "s" letter */}
        <path d="M53 1C43 1 36 5.8 36 14c0 6.8 4.4 10.8 13.2 13.2l3.8 1c4.8 1.3 6.5 3 6.5 5.8 0 3.2-2.8 5-8 5-5.2 0-9-2.3-12-5.8l-5.5 6C38 44.5 44.3 47 53 47c11 0 18-5.2 18-14 0-7-4.5-11-13.8-13.5L53 18C47.8 16.5 45.5 14.5 45.5 11c0-3 3-5 7.5-5 4.5 0 7.8 2 10.5 5L69 5.5C65.5 2.5 60 1 53 1z"/>
      </svg>
    </a>
  );
}

// ── Audiobook Player Bar ──────────────────────────────────────────────────────

function AudiobookPlayerBar() {
  const {
    currentBook, isPlaying, seek, duration, volume,
    togglePlay, prevChapter, nextChapter, seekTo, setVolume, stop
  } = useAudiobookPlayerStore();

  const [isMuted, setIsMuted] = useState(false);
  const progress = duration > 0 ? (seek / duration) * 100 : 0;

  const handleSeek = (percent: number) => {
    if (duration && seekTo) {
      seekTo(percent * duration);
    }
  };

  if (!currentBook) return null;

  return (
    <div className="relative w-full h-full flex items-center px-4">
      <ProgressBar progress={progress} onSeek={handleSeek} />
      
      {/* Left: Info */}
      <div className="flex items-center gap-4 w-[30%] pl-2">
        <div className="h-14 w-14 rounded-lg bg-black overflow-hidden shrink-0 ring-2 ring-white/10 shadow-lg">
          {currentBook.coverPath ? (
            <img src={currentBook.coverPath} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-white/30">🎧</div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{currentBook.title}</p>
          <p className="text-xs text-white/50 truncate">{currentBook.author}</p>
          <p className="text-xs text-white/50 tabular-nums">
            {formatDuration(seek)} / {formatDuration(duration)}
          </p>
        </div>
      </div>

      {/* Center: Controls */}
      <div className="flex items-center justify-center gap-2 flex-1">
        <button onClick={prevChapter} className="p-2 text-white/70 hover:text-white">
          <SkipBack className="h-5 w-5" />
        </button>
        
        <button 
          onClick={togglePlay}
          className="flex items-center justify-center w-12 h-12 bg-white text-black rounded-full hover:scale-105 transition-transform"
        >
          {isPlaying 
            ? <Pause className="h-6 w-6 fill-current" />
            : <Play className="h-6 w-6 fill-current ml-0.5" />}
        </button>
        
        <button onClick={nextChapter} className="p-2 text-white/70 hover:text-white">
          <SkipForward className="h-5 w-5" />
        </button>

        {/* Stop */}
        <button 
          onClick={stop}
          className="p-2 text-white/70 hover:text-white ml-2"
        >
          <Square className="h-4 w-4 fill-current" />
        </button>
      </div>

      {/* Right: Volume */}
      <div className="flex items-center justify-end w-[30%]">
        <VolumeControl 
          volume={volume} 
          isMuted={isMuted} 
          onToggleMute={() => setIsMuted(!isMuted)}
          onChange={setVolume}
        />
      </div>
    </div>
  );
}

// ── Minimized Video Bar ───────────────────────────────────────────────────────

function MinimizedVideoBar() {
  const { activeVideo, isPlaying, currentTime, duration, maximize, stop, setIsPlaying, updateProgress } = useVideoPlayerStore();
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isHovered, setIsHovered] = useState(false);
  
  if (!activeVideo) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleVideoSeek = (percent: number) => {
    const newTime = percent * duration;
    updateProgress(newTime, duration);
  };

  return (
    <div className="relative w-full h-full flex items-center px-4">
      <ProgressBar progress={progress} onSeek={handleVideoSeek} />
      
      {/* Left: Video Preview + Info */}
      <div className="flex items-center gap-4 w-[40%] pl-2">
        {/* Video Thumbnail with hover - use poster image instead of video element */}
        <div 
          className="relative h-14 w-24 rounded-lg bg-black overflow-hidden shrink-0 cursor-pointer ring-2 ring-white/10 shadow-lg"
          onClick={maximize}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {activeVideo.posterUrl ? (
            <img 
              src={activeVideo.posterUrl} 
              alt={activeVideo.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-white/30">
              <Film className="h-6 w-6" />
            </div>
          )}
          {isHovered && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <ChevronUp className="h-6 w-6 text-white" />
            </div>
          )}
        </div>
        
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{activeVideo.title}</p>
          <p className="text-xs text-white/50 truncate">{activeVideo.seriesTitle || ''}</p>
          <p className="text-xs text-white/50 tabular-nums">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </p>
        </div>
      </div>

      {/* Center: Controls */}
      <div className="flex items-center justify-center gap-1 flex-1">
        {/* Skip Back 10s */}
        <button 
          onClick={() => {
            const newTime = Math.max(0, currentTime - 10);
            updateProgress(newTime, duration);
          }}
          className="flex flex-col items-center justify-center w-10 h-10 text-white hover:bg-white/10 rounded"
        >
          <SkipBack className="h-4 w-4" />
          <span className="text-[8px] -mt-1">10</span>
        </button>

        {/* Play/Pause */}
        <button 
          onClick={() => setIsPlaying(!isPlaying)}
          className="flex items-center justify-center w-12 h-12 bg-white text-black rounded-full hover:scale-105 transition-transform mx-1"
        >
          {isPlaying 
            ? <Pause className="h-6 w-6 fill-current" />
            : <Play className="h-6 w-6 fill-current ml-0.5" />}
        </button>

        {/* Skip Forward 10s */}
        <button 
          onClick={() => {
            const newTime = Math.min(duration, currentTime + 10);
            updateProgress(newTime, duration);
          }}
          className="flex flex-col items-center justify-center w-10 h-10 text-white hover:bg-white/10 rounded"
        >
          <SkipForward className="h-4 w-4" />
          <span className="text-[8px] -mt-1">10</span>
        </button>

        {/* Stop */}
        <button 
          onClick={stop}
          className="p-2 text-white/70 hover:text-white ml-2"
        >
          <Square className="h-4 w-4 fill-current" />
        </button>
      </div>

      {/* Right: Volume */}
      <div className="flex items-center justify-end w-[30%]">
        <VolumeControl 
          volume={volume} 
          isMuted={isMuted} 
          onToggleMute={() => setIsMuted(!isMuted)}
          onChange={setVolume}
        />
      </div>
    </div>
  );
}

// ── Root PlayerBar ────────────────────────────────────────────────────────────

export function PlayerBar() {
  const { section } = useSectionStore();
  const { currentTrack } = usePlayerStore();
  const { currentBook } = useAudiobookPlayerStore();
  const { activeVideo, isMinimized } = useVideoPlayerStore();

  const showAudiobook = section === 'audiobook' && !!currentBook;
  const showVideoFullscreen = section === 'video' && !!activeVideo && !currentBook && !isMinimized;
  const showVideoMinimized = section === 'video' && !!activeVideo && !currentBook && isMinimized;
  const showMusic = !showAudiobook && !showVideoFullscreen && !showVideoMinimized && !!currentTrack;
  const showEmpty = !showAudiobook && !showVideoFullscreen && !showVideoMinimized && !showMusic;

  // Hide when video is fullscreen
  if (showVideoFullscreen) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50">
      <footer className="liquid-glass rounded-2xl h-[72px] relative overflow-hidden shadow-[0_8px_32px_0_rgba(0,0,0,0.8)]">
        {showEmpty && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-white/50 italic">
              {section === 'music' ? 'Wähle einen Song'
                : section === 'video' ? 'Wähle einen Film oder eine Serie'
                : 'Wähle ein Hörbuch'}
            </p>
          </div>
        )}
        {showAudiobook && <AudiobookPlayerBar />}
        {showMusic && <MusicPlayerBar />}
        {showVideoMinimized && <MinimizedVideoBar />}
      </footer>
    </div>
  );
}
