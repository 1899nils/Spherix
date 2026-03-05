import { useState } from 'react';
import { usePlayerStore, type RadioStation, type PodcastEpisodePlayerItem } from '@/stores/playerStore';
import { useAudiobookPlayerStore } from '@/stores/audiobookPlayerStore';
import { useVideoPlayerStore } from '@/stores/videoPlayerStore';
import { useSectionStore } from '@/stores/sectionStore';
import { formatDuration } from '@/lib/utils';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  Shuffle, Repeat, ChevronUp, Square
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

// ── Progress Bar Component ────────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="absolute top-0 left-0 right-0 h-1 bg-white/20">
      <div 
        className="h-full bg-red-600 transition-all duration-300"
        style={{ width: `${progress}%` }}
      />
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
  const progress = duration > 0 ? (seek / duration) * 100 : 0;

  if (!currentTrack) return null;

  return (
    <div className="relative w-full h-full flex items-center px-4">
      <ProgressBar progress={progress} />
      
      {/* Left: Info */}
      <div className="flex items-center gap-3 w-[30%]">
        <div className="h-12 w-12 rounded bg-black overflow-hidden shrink-0">
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
            {isRadio ? (currentTrack as RadioStation).name : currentTrack.title}
          </p>
          <p className="text-xs text-white/50 truncate">
            {isRadio ? 'Live Radio' : isPodcast ? (currentTrack as PodcastEpisodePlayerItem).podcastTitle : currentTrack.artist.name}
          </p>
          <p className="text-xs text-white/50 tabular-nums">
            {isRadio ? 'LIVE' : `${formatDuration(seek)} / ${formatDuration(duration)}`}
          </p>
        </div>
      </div>

      {/* Center: Controls */}
      <div className="flex items-center justify-center gap-2 flex-1">
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
      </div>

      {/* Right: Volume */}
      <div className="flex items-center justify-end w-[30%]">
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
    togglePlay, prevChapter, nextChapter, setVolume
  } = useAudiobookPlayerStore();

  const [isMuted, setIsMuted] = useState(false);
  const progress = duration > 0 ? (seek / duration) * 100 : 0;

  if (!currentBook) return null;

  return (
    <div className="relative w-full h-full flex items-center px-4">
      <ProgressBar progress={progress} />
      
      {/* Left: Info */}
      <div className="flex items-center gap-3 w-[30%]">
        <div className="h-12 w-12 rounded bg-black overflow-hidden shrink-0">
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
  const { activeVideo, isPlaying, currentTime, duration, maximize, stop, setIsPlaying } = useVideoPlayerStore();
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isHovered, setIsHovered] = useState(false);
  
  if (!activeVideo) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="relative w-full h-full flex items-center px-4">
      <ProgressBar progress={progress} />
      
      {/* Left: Video Preview + Info */}
      <div className="flex items-center gap-3 w-[40%]">
        {/* Video Thumbnail with hover */}
        <div 
          className="relative h-12 w-20 rounded bg-black overflow-hidden shrink-0 cursor-pointer"
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
          onClick={() => setIsPlaying(!isPlaying)}
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
          onClick={() => setIsPlaying(!isPlaying)}
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
      <footer className="bg-[#1a1a1a] rounded-lg h-16 relative overflow-hidden">
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
