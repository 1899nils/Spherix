import { useRef, useState, useEffect, useCallback } from 'react';
import { useVideoPlayerStore } from '@/stores/videoPlayerStore';
import { usePlayerStore } from '@/stores/playerStore';
import { formatDuration } from '@/lib/utils';
import {
  Play, Pause, Volume2, VolumeX, Maximize, SkipBack, SkipForward, X, ChevronDown
} from 'lucide-react';



interface VideoPlayerProps {
  src: string;
  title: string;
  subtitle?: string;
  posterUrl?: string | null;
  savedPosition?: number;
  duration?: number | null;
  onClose: () => void;
  onProgress?: (position: number) => void;
  onComplete?: () => void;
  introStart?: number | null;
  introEnd?: number | null;
  nextEpisode?: {
    title: string;
    thumbnail?: string;
    onPlay: () => void;
  } | null;
}

export function VideoPlayer({
  src,
  title,
  subtitle,
  posterUrl,
  savedPosition = 0,
  duration: propDuration,
  onClose,
  onProgress,
  onComplete,
  introStart,
  introEnd,
  nextEpisode,
}: VideoPlayerProps) {
  const { minimize, updateProgress } = useVideoPlayerStore();
  const { pause } = usePlayerStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [seek, setSeek] = useState(0);
  const [duration, setDuration] = useState(propDuration || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [buffered, setBuffered] = useState(0);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const [countdown] = useState(5);

  // Auto-hide controls
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false);
      }
    }, 3000);
  }, []);

  // Initialize video
  useEffect(() => {
    pause();
    
    const video = videoRef.current;
    if (!video) return;

    video.muted = false;
    video.volume = volume;

    const onLoaded = () => {
      setDuration(video.duration);
      setIsLoading(false);
      if (savedPosition > 0 && savedPosition < video.duration - 5) {
        video.currentTime = savedPosition;
      }
      video.play().catch(() => {});
    };

    const onProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('progress', onProgress);
    
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('progress', onProgress);
    };
  }, [savedPosition, pause]);

  // Sync playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      setSeek(video.currentTime);
      onProgress?.(Math.floor(video.currentTime));
      updateProgress(video.currentTime, video.duration);
      
      if (introStart != null && introEnd != null) {
        const inIntro = video.currentTime >= introStart && video.currentTime < introEnd - 5;
        setShowSkipIntro(inIntro);
      }
      
      if (nextEpisode && video.currentTime > video.duration - 30) {
        setShowNextEpisode(true);
      } else {
        setShowNextEpisode(false);
      }
    };
    
    const onPlay = () => { setIsPlaying(true); resetHideTimer(); };
    const onPause = () => { setIsPlaying(false); setShowControls(true); };
    const onEnded = () => { setIsPlaying(false); setShowControls(true); onComplete?.(); };

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
    };
  }, [onProgress, onComplete, introStart, introEnd, nextEpisode, resetHideTimer]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(10);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skip(-10);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'Escape':
          onClose();
          break;
      }
      resetHideTimer();
    };
    
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, resetHideTimer]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.paused ? video.play() : video.pause();
    resetHideTimer();
  };

  const handleSeek = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    setSeek(seconds);
    resetHideTimer();
  };

  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    resetHideTimer();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    resetHideTimer();
  };

  const handleVolume = (v: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = v;
    setVolume(v);
    setIsMuted(v === 0);
    resetHideTimer();
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const skipIntro = () => {
    if (introEnd) {
      handleSeek(introEnd);
      setShowSkipIntro(false);
    }
  };

  const progressPercent = duration ? (seek / duration) * 100 : 0;

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : Volume2;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black flex flex-col"
      onMouseMove={resetHideTimer}
    >
      {/* Video */}
      <div className="flex-1 relative" onClick={togglePlay}>
        <video
          ref={videoRef}
          src={src}
          poster={posterUrl ?? undefined}
          className="w-full h-full object-contain"
          autoPlay
          playsInline
        />

        {/* Loading */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="h-12 w-12 rounded-full border-4 border-white/20 border-t-red-600 animate-spin" />
          </div>
        )}

        {/* Skip Intro */}
        {showSkipIntro && (
          <button
            onClick={(e) => { e.stopPropagation(); skipIntro(); }}
            className="absolute bottom-28 right-8 px-6 py-3 bg-white text-black font-semibold rounded hover:bg-white/90"
          >
            Intro überspringen
          </button>
        )}

        {/* Next Episode */}
        {showNextEpisode && nextEpisode && (
          <div className="absolute bottom-28 right-8 bg-black/90 rounded-lg p-4">
            <p className="text-xs text-white/70 mb-2">Nächste in {countdown}s</p>
            <p className="text-sm text-white mb-3">{nextEpisode.title}</p>
            <button 
              className="px-4 py-2 bg-red-600 text-white rounded"
              onClick={() => nextEpisode.onPlay()}
            >
              Jetzt abspielen
            </button>
          </div>
        )}

        {/* Top Bar */}
        <div className={`absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent transition-opacity ${showControls ? 'opacity-100' : 'opacity-0'}`}>
          <button onClick={minimize} className="text-white/80 hover:text-white p-2">
            <ChevronDown className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-white/80 hover:text-white p-2">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Unified Control Bar - Same style as PlayerBar */}
      <div 
        className={`bg-[#1a1a1a] h-16 relative transition-all duration-300 ${showControls ? 'translate-y-0' : 'translate-y-full'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress Bar at top */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/20">
          <div 
            className="h-full bg-red-600 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Controls Row - Same layout as PlayerBar */}
        <div className="flex items-center justify-between h-full px-4">
          {/* Left: Info */}
          <div className="flex items-center gap-3 w-[30%]">
            {posterUrl && (
              <img src={posterUrl} alt="" className="h-12 w-12 object-cover rounded bg-black" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{title}</p>
              {subtitle && <p className="text-xs text-white/50 truncate">{subtitle}</p>}
              <p className="text-xs text-white/50 tabular-nums">
                {formatDuration(seek)} / {formatDuration(duration)}
              </p>
            </div>
          </div>

          {/* Center: Playback Controls */}
          <div className="flex items-center justify-center gap-1 flex-1">
            {/* Skip Back */}
            <button 
              onClick={() => skip(-10)}
              className="flex flex-col items-center justify-center w-10 h-10 text-white hover:bg-white/10 rounded"
            >
              <SkipBack className="h-4 w-4" />
              <span className="text-[8px] -mt-1">10</span>
            </button>

            {/* Play/Pause */}
            <button 
              onClick={togglePlay}
              className="flex items-center justify-center w-12 h-12 bg-white text-black rounded-full hover:scale-105 transition-transform mx-1"
            >
              {isPlaying 
                ? <Pause className="h-6 w-6 fill-current" />
                : <Play className="h-6 w-6 fill-current ml-0.5" />}
            </button>

            {/* Skip Forward */}
            <button 
              onClick={() => skip(10)}
              className="flex flex-col items-center justify-center w-10 h-10 text-white hover:bg-white/10 rounded"
            >
              <SkipForward className="h-4 w-4" />
              <span className="text-[8px] -mt-1">10</span>
            </button>

            {/* Next Episode */}
            {nextEpisode && (
              <button 
                onClick={() => nextEpisode.onPlay()}
                className="ml-1 w-10 h-10 rounded overflow-hidden bg-black hover:ring-2 hover:ring-white/50"
              >
                {nextEpisode.thumbnail ? (
                  <img src={nextEpisode.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/50">
                    <SkipForward className="h-4 w-4" />
                  </div>
                )}
              </button>
            )}
          </div>

          {/* Right: Volume & Fullscreen */}
          <div className="flex items-center justify-end w-[30%]">
            {/* Volume */}
            <div className="flex items-center gap-2">
              <button onClick={toggleMute} className="text-white/80 hover:text-white p-2">
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
                  onChange={(e) => handleVolume(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </div>

            {/* Fullscreen */}
            <button onClick={toggleFullscreen} className="text-white/80 hover:text-white p-2 ml-2">
              <Maximize className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
