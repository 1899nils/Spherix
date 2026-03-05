import { useState } from 'react';
import { usePlayerStore, type RadioStation, type PodcastEpisodePlayerItem } from '@/stores/playerStore';
import { useAudiobookPlayerStore } from '@/stores/audiobookPlayerStore';
import { useVideoPlayerStore } from '@/stores/videoPlayerStore';
import { useSectionStore } from '@/stores/sectionStore';
import { formatDuration } from '@/lib/utils';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  ChevronUp, Square
} from 'lucide-react';

// ── Unified Control Bar Style ─────────────────────────────────────────────────

// Shared volume component
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
    <div className="flex items-center gap-2 group">
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

// ── Music Player Bar ──────────────────────────────────────────────────────────

function MusicPlayerBar() {
  const {
    currentTrack, isPlaying, seek, duration, volume, isMuted,
    togglePlay, next, prev, setVolume, toggleMute
  } = usePlayerStore();

  const isRadio = !!(currentTrack && 'isRadio' in currentTrack);
  const isPodcast = !!(currentTrack && 'isPodcast' in currentTrack);

  const skip = (seconds: number) => {
    // Music player doesn't have skip function in store, use prev/next
    if (seconds > 0) next();
    else prev();
  };

  if (!currentTrack) return null;

  return (
    <div className="flex items-center justify-between w-full h-full gap-4 px-2">
      {/* Left: Info + Thumbnail */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Thumbnail */}
        <div className="h-14 w-14 rounded bg-black overflow-hidden shrink-0">
          {'isRadio' in currentTrack ? (
            currentTrack.favicon ? (
              <img src={currentTrack.favicon} alt="" className="h-full w-full object-contain p-2" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-2xl">📻</div>
            )
          ) : 'isPodcast' in currentTrack ? (
            (currentTrack as PodcastEpisodePlayerItem).imageUrl ? (
              <img src={(currentTrack as PodcastEpisodePlayerItem).imageUrl!} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-2xl">🎙️</div>
            )
          ) : (
            currentTrack.album?.coverUrl ? (
              <img src={currentTrack.album.coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-white/30">♪</div>
            )
          )}
        </div>

        {/* Info */}
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {isRadio ? (currentTrack as RadioStation).name : currentTrack.title}
          </p>
          <p className="text-xs text-white/60 truncate">
            {isRadio ? 'Live Radio' : isPodcast ? (currentTrack as PodcastEpisodePlayerItem).podcastTitle : currentTrack.artist.name}
          </p>
          <p className="text-xs text-white/60 tabular-nums">
            {isRadio ? 'LIVE' : `${formatDuration(seek)} / ${formatDuration(duration)}`}
          </p>
        </div>
      </div>

      {/* Center: Playback Controls */}
      <div className="flex items-center gap-2">
        {/* Skip Back */}
        <button 
          onClick={() => skip(-10)}
          className="flex flex-col items-center justify-center w-11 h-11 text-white hover:bg-white/10 rounded"
        >
          <SkipBack className="h-4 w-4" />
          <span className="text-[9px] -mt-0.5">10</span>
        </button>

        {/* Play/Pause */}
        <button 
          onClick={togglePlay}
          className="flex items-center justify-center w-14 h-14 bg-white text-black rounded-full hover:bg-white/90 mx-1"
        >
          {isPlaying 
            ? <Pause className="h-6 w-6 fill-current" />
            : <Play className="h-6 w-6 fill-current ml-0.5" />}
        </button>

        {/* Skip Forward */}
        <button 
          onClick={() => skip(10)}
          className="flex flex-col items-center justify-center w-11 h-11 text-white hover:bg-white/10 rounded"
        >
          <SkipForward className="h-4 w-4" />
          <span className="text-[9px] -mt-0.5">10</span>
        </button>
      </div>

      {/* Right: Volume */}
      <div className="flex items-center justify-end flex-1">
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

// ── Audiobook Player Bar ──────────────────────────────────────────────────────

function AudiobookPlayerBar() {
  const {
    currentBook, isPlaying, seek, duration, volume,
    togglePlay, setVolume
  } = useAudiobookPlayerStore();

  const [isMuted, setIsMuted] = useState(false);

  // const chapter = currentBook?.chapters[chapterIndex];

  const skip = (_seconds: number) => {
    // seekTo(Math.max(0, Math.min(duration, seek + seconds)));
  };

  if (!currentBook) return null;

  return (
    <div className="flex items-center justify-between w-full h-full gap-4 px-2">
      {/* Left: Info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="h-14 w-14 rounded bg-black overflow-hidden shrink-0">
          {currentBook.coverPath ? (
            <img src={currentBook.coverPath} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-white/30">🎧</div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{currentBook.title}</p>
          <p className="text-xs text-white/60 truncate">{currentBook.author}</p>
          <p className="text-xs text-white/60 tabular-nums">
            {formatDuration(seek)} / {formatDuration(duration)}
          </p>
        </div>
      </div>

      {/* Center: Controls */}
      <div className="flex items-center gap-2">
        <button 
          onClick={() => skip(-10)}
          disabled={chapterIndex === 0 && seek < 10}
          className="flex flex-col items-center justify-center w-11 h-11 text-white hover:bg-white/10 rounded disabled:opacity-50"
        >
          <SkipBack className="h-4 w-4" />
          <span className="text-[9px] -mt-0.5">10</span>
        </button>

        <button 
          onClick={togglePlay}
          className="flex items-center justify-center w-14 h-14 bg-white text-black rounded-full hover:bg-white/90 mx-1"
        >
          {isPlaying 
            ? <Pause className="h-6 w-6 fill-current" />
            : <Play className="h-6 w-6 fill-current ml-0.5" />}
        </button>

        <button 
          onClick={() => skip(10)}
          disabled={!currentBook || chapterIndex >= currentBook.chapters.length - 1}
          className="flex flex-col items-center justify-center w-11 h-11 text-white hover:bg-white/10 rounded disabled:opacity-50"
        >
          <SkipForward className="h-4 w-4" />
          <span className="text-[9px] -mt-0.5">10</span>
        </button>
      </div>

      {/* Right: Volume */}
      <div className="flex items-center justify-end flex-1">
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
  const { activeVideo, isPlaying, currentTime, duration, maximize, stop, setIsPlaying } = useVideoPlayerStore();
  const [isHovered, setIsHovered] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  
  if (!activeVideo) return null;

  const skip = (seconds: number) => {
    // Video skip handled in player component
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="flex items-center justify-between w-full h-full gap-4 px-2">
      {/* Left: Video Preview + Info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Video Preview with hover */}
        <div 
          className="relative h-14 w-20 rounded bg-black overflow-hidden shrink-0 cursor-pointer"
          onClick={maximize}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <video
            src={activeVideo.streamUrl}
            className="h-full w-full object-cover"
            muted
            playsInline
          />
          {isHovered && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <ChevronUp className="h-6 w-6 text-white" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{activeVideo.title}</p>
          <p className="text-xs text-white/60 truncate">{activeVideo.seriesTitle || ''}</p>
          <p className="text-xs text-white/60 tabular-nums">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </p>
        </div>
      </div>

      {/* Center: Controls */}
      <div className="flex items-center gap-2">
        <button 
          onClick={() => skip(-10)}
          className="flex flex-col items-center justify-center w-11 h-11 text-white hover:bg-white/10 rounded"
        >
          <SkipBack className="h-4 w-4" />
          <span className="text-[9px] -mt-0.5">10</span>
        </button>

        <button 
          onClick={() => setIsPlaying(!isPlaying)}
          className="flex items-center justify-center w-14 h-14 bg-white text-black rounded-full hover:bg-white/90 mx-1"
        >
          {isPlaying 
            ? <Pause className="h-6 w-6 fill-current" />
            : <Play className="h-6 w-6 fill-current ml-0.5" />}
        </button>

        <button 
          onClick={() => skip(10)}
          className="flex flex-col items-center justify-center w-11 h-11 text-white hover:bg-white/10 rounded"
        >
          <SkipForward className="h-4 w-4" />
          <span className="text-[9px] -mt-0.5">10</span>
        </button>

        {/* Stop button */}
        <button 
          onClick={stop}
          className="flex items-center justify-center w-10 h-10 text-white hover:bg-white/10 rounded ml-2"
        >
          <Square className="h-4 w-4 fill-current" />
        </button>
      </div>

      {/* Right: Volume */}
      <div className="flex items-center justify-end flex-1">
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

  // Progress bar color based on content type
  const progressColor = showVideoMinimized ? 'bg-red-600' : 'bg-red-600';

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50">
      <footer className="bg-[#1a1a1a] rounded-xl flex flex-col shadow-[0_8px_32px_0_rgba(0,0,0,0.8)] overflow-hidden h-20">
        {/* Progress Bar at top */}
        <div className="h-1 bg-white/10 w-full">
          <div className={`h-full ${progressColor} transition-all`} style={{ width: '0%' }} />
        </div>

        {/* Content */}
        <div className="flex-1">
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
        </div>
      </footer>
    </div>
  );
}
