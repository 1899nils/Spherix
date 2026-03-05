import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/utils';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, X
} from 'lucide-react';

interface VideoQuality {
  label: string;
  width: number;
  height: number;
}

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
  streamInfo?: {
    directPlay: boolean;
  } | null;
  isTranscoding?: boolean;
  transcodeProgress?: number;
  availableQualities?: VideoQuality[];
  currentQuality?: VideoQuality;
  onQualityChange?: (quality: VideoQuality) => void;
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
  streamInfo,
  isTranscoding = false,
  transcodeProgress = 0,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [seek, setSeek] = useState(0);
  const [duration, setDuration] = useState(propDuration || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [buffered, setBuffered] = useState(0);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const [countdown, setCountdown] = useState(5);

  // Auto-hide controls (Netflix style)
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
    const video = videoRef.current;
    if (!video) return;

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
  }, [savedPosition]);

  // Sync playback state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      setSeek(video.currentTime);
      onProgress?.(Math.floor(video.currentTime));
      
      // Skip intro
      if (introStart != null && introEnd != null) {
        const inIntro = video.currentTime >= introStart && video.currentTime < introEnd - 5;
        setShowSkipIntro(inIntro);
      }
      
      // Next episode
      if (nextEpisode && video.currentTime > video.duration - 30) {
        setShowNextEpisode(true);
      } else {
        setShowNextEpisode(false);
      }
    };
    
    const onPlay = () => { setIsPlaying(true); resetHideTimer(); };
    const onPause = () => { setIsPlaying(false); setShowControls(true); };
    const onEnded = () => { 
      setIsPlaying(false); 
      setShowControls(true);
      onComplete?.();
    };

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [onProgress, onComplete, introStart, introEnd, nextEpisode, resetHideTimer]);

  // Fullscreen detection
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Countdown for next episode
  useEffect(() => {
    if (!showNextEpisode || !nextEpisode) return;
    
    setCountdown(5);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          nextEpisode.onPlay();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [showNextEpisode, nextEpisode]);

  // Keyboard shortcuts
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
          if (!isFullscreen) onClose();
          break;
      }
      resetHideTimer();
    };
    
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, onClose, resetHideTimer]);

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

  const handleVolume = (v: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = v;
    setVolume(v);
    setIsMuted(v === 0);
    resetHideTimer();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    resetHideTimer();
  };

  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    resetHideTimer();
  };

  const skipIntro = () => {
    if (introEnd) {
      handleSeek(introEnd);
      setShowSkipIntro(false);
    }
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

  // Calculate progress percentages
  const progressPercent = duration ? (seek / duration) * 100 : 0;
  const bufferedPercent = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen bg-black overflow-hidden cursor-default"
      onMouseMove={resetHideTimer}
      onClick={togglePlay}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={src}
        poster={posterUrl ?? undefined}
        className="absolute inset-0 w-full h-full object-contain"
        preload="metadata"
        playsInline
      />

      {/* Loading spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 gap-3">
          <div className="h-12 w-12 rounded-full border-4 border-white/20 border-t-red-600 animate-spin" />
          {isTranscoding && (
            <div className="text-center text-white">
              <p className="text-sm">Wird für dein Gerät optimiert...</p>
              <p className="text-xs text-white/60">{transcodeProgress}%</p>
            </div>
          )}
        </div>
      )}

      {/* Controls Overlay - Netflix Style */}
      <div
        className={`absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/70 via-transparent to-black/70 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar - Title & Close */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-white hover:bg-white/20"
              onClick={onClose}
            >
              <X className="h-6 w-6" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-white">{title}</h1>
              {subtitle && <p className="text-sm text-white/70">{subtitle}</p>}
            </div>
          </div>
          {streamInfo && (
            <span className={`text-xs px-2 py-1 rounded ${
              streamInfo.directPlay 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-amber-500/20 text-amber-400'
            }`}>
              {streamInfo.directPlay ? 'Direct Play' : 'Transcode'}
            </span>
          )}
        </div>

        {/* Center - Play button when paused */}
        {!isPlaying && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center">
              <Play className="h-10 w-10 text-white fill-white ml-1" />
            </div>
          </div>
        )}

        {/* Skip Intro Button */}
        {showSkipIntro && (
          <button
            onClick={skipIntro}
            className="absolute bottom-32 right-8 px-6 py-3 bg-white/90 text-black font-semibold rounded hover:bg-white transition-all"
          >
            Intro überspringen
          </button>
        )}

        {/* Next Episode */}
        {showNextEpisode && nextEpisode && (
          <div className="absolute bottom-32 right-8 bg-black/90 rounded-lg p-4 max-w-xs">
            <p className="text-xs text-white/70 mb-2">Nächste Episode in {countdown}s</p>
            <p className="text-sm font-medium text-white mb-3">{nextEpisode.title}</p>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={() => { setShowNextEpisode(false); nextEpisode.onPlay(); }}
              >
                Jetzt abspielen
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => setShowNextEpisode(false)}
              >
                Abbrechen
              </Button>
            </div>
          </div>
        )}

        {/* Bottom controls - Netflix style */}
        <div className="px-6 pb-6 space-y-3">
          {/* Progress bar */}
          <div 
            className="relative h-1 bg-white/30 cursor-pointer group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              handleSeek(percent * duration);
            }}
          >
            {/* Buffered */}
            <div 
              className="absolute h-full bg-white/40"
              style={{ width: `${bufferedPercent}%` }}
            />
            {/* Progress - Netflix red */}
            <div 
              className="absolute h-full bg-red-600 group-hover:h-1.5 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
            {/* Scrub handle */}
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${progressPercent}%`, transform: 'translateX(-50%) translateY(-50%)' }}
            />
          </div>

          {/* Control buttons row */}
          <div className="flex items-center justify-between">
            {/* Left controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={togglePlay}
                className="text-white hover:text-white/80 transition-colors"
              >
                {isPlaying
                  ? <Pause className="h-8 w-8 fill-current" />
                  : <Play className="h-8 w-8 fill-current" />}
              </button>
              
              <button
                onClick={() => skip(-10)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <SkipBack className="h-6 w-6" />
              </button>
              
              <button
                onClick={() => skip(10)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <SkipForward className="h-6 w-6" />
              </button>

              {/* Volume */}
              <div className="flex items-center gap-2 group/volume">
                <button
                  onClick={toggleMute}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  {isMuted || volume === 0 
                    ? <VolumeX className="h-6 w-6" />
                    : <Volume2 className="h-6 w-6" />}
                </button>
                <div className="w-0 overflow-hidden group-hover/volume:w-24 transition-all">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => handleVolume(parseFloat(e.target.value))}
                    className="w-24 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                  />
                </div>
              </div>

              {/* Time */}
              <span className="text-sm text-white/80 tabular-nums">
                {formatDuration(seek)} / {formatDuration(duration)}
              </span>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={toggleFullscreen}
                className="text-white/80 hover:text-white transition-colors"
              >
                {isFullscreen 
                  ? <Minimize className="h-6 w-6" /> 
                  : <Maximize className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
