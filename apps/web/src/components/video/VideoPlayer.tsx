import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { formatDuration } from '@/lib/utils';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, ArrowLeft,
} from 'lucide-react';

interface VideoPlayerProps {
  src: string;
  title: string;
  subtitle?: string;
  posterUrl?: string | null;
  savedPosition?: number;
  onClose: () => void;
  onProgress?: (position: number) => void;
}

export function VideoPlayer({
  src,
  title,
  subtitle,
  posterUrl,
  savedPosition = 0,
  onClose,
  onProgress,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [seek, setSeek] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Show controls briefly then hide
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false);
      }
    }, 3000);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [resetHideTimer]);

  // Seek to saved position once loaded
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
    video.addEventListener('loadedmetadata', onLoaded);
    return () => video.removeEventListener('loadedmetadata', onLoaded);
  }, [savedPosition]);

  // Sync seek
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      setSeek(video.currentTime);
      onProgress?.(Math.floor(video.currentTime));
    };
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => { setIsPlaying(false); setShowControls(true); };
    const onEnded = () => { setIsPlaying(false); setShowControls(true); };
    const onWaiting = () => setIsLoading(true);
    const onPlaying = () => setIsLoading(false);

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
    };
  }, [onProgress]);

  // Fullscreen detection
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
      if (e.key === 'ArrowRight') video.currentTime = Math.min(video.duration, video.currentTime + 10);
      if (e.key === 'ArrowLeft')  video.currentTime = Math.max(0, video.currentTime - 10);
      if (e.key === 'f') toggleFullscreen();
      if (e.key === 'm') toggleMute();
      if (e.key === 'Escape' && !isFullscreen) onClose();
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

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : Volume2;

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black rounded-xl overflow-hidden"
      style={{ aspectRatio: '16/9' }}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={src}
        poster={posterUrl ?? undefined}
        className="w-full h-full object-contain"
        onClick={togglePlay}
        preload="metadata"
      />

      {/* Loading spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-12 w-12 rounded-full border-4 border-white/20 border-t-white animate-spin" />
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        {/* Top bar */}
        <div className="flex items-center gap-3 p-4 bg-gradient-to-b from-black/70 to-transparent">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-white/10 text-white"
            onClick={onClose}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{title}</p>
            {subtitle && <p className="text-xs text-white/60 truncate">{subtitle}</p>}
          </div>
        </div>

        {/* Bottom controls */}
        <div className="p-4 bg-gradient-to-t from-black/80 to-transparent space-y-2">
          {/* Seekbar */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/70 tabular-nums w-10 text-right">
              {formatDuration(seek)}
            </span>
            <Slider
              value={seek}
              max={duration || 1}
              onChange={handleSeek}
              className="flex-1"
            />
            <span className="text-xs text-white/70 tabular-nums w-10">
              {formatDuration(duration)}
            </span>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/10" onClick={toggleMute}>
                <VolumeIcon className="h-4 w-4" />
              </Button>
              <Slider value={isMuted ? 0 : volume} max={1} onChange={handleVolume} className="w-20" />
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-10 w-10 text-white hover:bg-white/10" onClick={() => skip(-10)}>
                <SkipBack className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12 rounded-full bg-white/20 hover:bg-white/30 text-white border border-white/20"
                onClick={togglePlay}
              >
                {isPlaying
                  ? <Pause className="h-6 w-6 fill-current" />
                  : <Play className="h-6 w-6 fill-current ml-0.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 text-white hover:bg-white/10" onClick={() => skip(10)}>
                <SkipForward className="h-5 w-5" />
              </Button>
            </div>

            <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/10" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
