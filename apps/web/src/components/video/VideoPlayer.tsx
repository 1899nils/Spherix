import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { formatDuration } from '@/lib/utils';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, ArrowLeft, Settings2,
  PictureInPicture2, SkipForward as SkipIcon,
  Subtitles, Languages, Loader2
} from 'lucide-react';

// Types for tracks
interface TextTrack {
  kind: string;
  label: string;
  srclang: string;
  src?: string;
  default?: boolean;
}

interface AudioTrack {
  id: string;
  label: string;
  language: string;
  enabled: boolean;
}

interface VideoQuality {
  label: string;
  width: number;
  height: number;
  bitrate: number;
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
  // Optional: Skip intro markers
  introStart?: number | null;
  introEnd?: number | null;
  // Optional: External subtitles
  textTracks?: TextTrack[];
  // Next episode info
  nextEpisode?: {
    title: string;
    thumbnail?: string;
    onPlay: () => void;
  } | null;
  // Streaming info
  streamInfo?: {
    directPlay: boolean;
    directPlayReason?: string;
    mediaInfo?: {
      video: {
        codec: string;
        width: number;
        height: number;
      } | null;
      audio: { codec: string; language?: string }[];
    };
  } | null;
  isTranscoding?: boolean;
  transcodeProgress?: number;
  // Available qualities (for HLS/DASH)
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
  textTracks = [],
  nextEpisode,
  streamInfo,
  isTranscoding = false,
  transcodeProgress = 0,
  availableQualities = [],
  currentQuality,
  onQualityChange,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const ambiRef = useRef<HTMLCanvasElement>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [seek, setSeek] = useState(0);
  const [duration, setDuration] = useState(propDuration || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [buffered, setBuffered] = useState(0);
  
  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'audio' | 'subtitles' | 'quality'>('audio');
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPreview, setScrubPreview] = useState<{ time: number; x: number } | null>(null);
  
  // Track states
  const [availableTextTracks, setAvailableTextTracks] = useState<TextTrack[]>([]);
  const [currentTextTrack, setCurrentTextTrack] = useState<number>(-1);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Ambilight colors
  const [ambilightColor, setAmbilightColor] = useState('rgba(0,0,0,0)');

  // Show controls briefly then hide
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused && !showSettings) {
        setShowControls(false);
      }
    }, 3000);
  }, [showSettings]);

  // Update ambilight effect (throttled)
  const ambilightFrameRef = useRef<number>(0);
  const updateAmbilight = useCallback(() => {
    const video = videoRef.current;
    const canvas = ambiRef.current;
    if (!video || !canvas || video.paused || video.ended) return;
    
    // Only update every 10th frame for performance
    ambilightFrameRef.current++;
    if (ambilightFrameRef.current % 10 !== 0) return;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    // Sample a small area for performance
    canvas.width = 8;
    canvas.height = 8;
    ctx.drawImage(video, 0, 0, 8, 8);
    
    const frame = ctx.getImageData(0, 0, 8, 8);
    let r = 0, g = 0, b = 0;
    const length = frame.data.length / 4;
    
    for (let i = 0; i < length; i++) {
      r += frame.data[i * 4];
      g += frame.data[i * 4 + 1];
      b += frame.data[i * 4 + 2];
    }
    
    r = Math.round(r / length);
    g = Math.round(g / length);
    b = Math.round(b / length);
    
    setAmbilightColor(`rgba(${r}, ${g}, ${b}, 0.25)`);
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
      
      // Setup text tracks
      if (textTracks.length > 0) {
        textTracks.forEach((track, index) => {
          const trackEl = video.addTextTrack(track.kind as TextTrackKind, track.label, track.srclang);
          // Note: In a real implementation, you'd load the VTT content here
          if (track.default) {
            trackEl.mode = 'showing';
            setCurrentTextTrack(index);
          }
        });
      }
      
      // Auto-play
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
  }, [savedPosition, textTracks]);

  // Sync playback state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      setSeek(video.currentTime);
      onProgress?.(Math.floor(video.currentTime));
      
      // Check for skip intro
      if (introStart !== null && introEnd !== null) {
        const inIntro = video.currentTime >= introStart && video.currentTime < introEnd - 5;
        setShowSkipIntro(inIntro);
      }
      
      // Check for next episode
      if (nextEpisode && video.currentTime > video.duration - 30) {
        setShowNextEpisode(true);
      } else {
        setShowNextEpisode(false);
      }
      
      updateAmbilight();
    };
    
    const onPlay = () => setIsPlaying(true);
    const onPause = () => { setIsPlaying(false); setShowControls(true); };
    const onEnded = () => { 
      setIsPlaying(false); 
      setShowControls(true);
      onComplete?.();
    };
    const onWaiting = () => setIsLoading(true);
    const onPlaying = () => setIsLoading(false);
    const onRateChange = () => setPlaybackRate(video.playbackRate);

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('ratechange', onRateChange);

    // Progress tracking interval
    progressInterval.current = setInterval(() => {
      if (video.playing) {
        onProgress?.(Math.floor(video.currentTime));
      }
    }, 5000);

    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('ratechange', onRateChange);
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [onProgress, onComplete, introStart, introEnd, nextEpisode, updateAmbilight]);

  // Fullscreen detection
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // PiP detection
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const onPiPChange = () => {
      setIsPiP(!!document.pictureInPictureElement);
    };
    
    video.addEventListener('enterpictureinpicture', onPiPChange);
    video.addEventListener('leavepictureinpicture', onPiPChange);
    
    return () => {
      video.removeEventListener('enterpictureinpicture', onPiPChange);
      video.removeEventListener('leavepictureinpicture', onPiPChange);
    };
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
        case 'ArrowUp':
          e.preventDefault();
          handleVolume(Math.min(1, volume + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleVolume(Math.max(0, volume - 0.1));
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 's':
          e.preventDefault();
          setShowSettings(s => !s);
          break;
        case 'Escape':
          if (showSettings) {
            setShowSettings(false);
          } else if (!isFullscreen) {
            onClose();
          }
          break;
      }
      resetHideTimer();
    };
    
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, onClose, resetHideTimer, showSettings, volume]);

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

  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (err) {
      console.error('PiP error:', err);
    }
  };

  const handleScrubHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const time = percent * duration;
    setScrubPreview({ time, x });
  };

  const VolumeIcon = isMuted || volume === 0 ? VolumeX : Volume2;

  // Calculate progress percentage
  const progressPercent = duration ? (seek / duration) * 100 : 0;
  const bufferedPercent = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black rounded-xl overflow-hidden group"
      style={{ aspectRatio: '16/9' }}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* Ambilight background */}
      <div 
        className="absolute inset-0 transition-colors duration-500 blur-3xl opacity-50 pointer-events-none"
        style={{ backgroundColor: ambilightColor }}
      />
      <canvas ref={ambiRef} className="hidden" />

      {/* Video element */}
      <video
        ref={videoRef}
        src={src}
        poster={posterUrl ?? undefined}
        className="relative w-full h-full object-contain"
        onClick={togglePlay}
        preload="metadata"
        playsInline
      />

      {/* Center play button (shows when paused) */}
      {!isPlaying && !isLoading && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
        >
          <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/30 flex items-center justify-center hover:scale-110 transition-transform">
            <Play className="h-10 w-10 text-white fill-white ml-1" />
          </div>
        </button>
      )}

      {/* Loading spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/20 gap-3">
          <div className="h-12 w-12 rounded-full border-4 border-white/20 border-t-section-accent animate-spin" />
          {isTranscoding && (
            <div className="text-center">
              <p className="text-sm text-white/80">Wird für dein Gerät optimiert...</p>
              <p className="text-xs text-white/60">{transcodeProgress}%</p>
              <div className="w-32 h-1 bg-white/20 rounded-full mt-2 overflow-hidden">
                <div 
                  className="h-full bg-section-accent transition-all"
                  style={{ width: `${transcodeProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stream Info Badge */}
      {streamInfo && (
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {streamInfo.directPlay ? (
            <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded-full border border-green-500/30">
              Direct Play
            </span>
          ) : (
            <span className="px-2 py-1 text-xs bg-amber-500/20 text-amber-400 rounded-full border border-amber-500/30">
              Transcode
            </span>
          )}
          {streamInfo.mediaInfo?.video && (
            <span className="px-2 py-1 text-xs bg-white/10 text-white/60 rounded-full">
              {streamInfo.mediaInfo.video.codec.toUpperCase()}
            </span>
          )}
        </div>
      )}

      {/* Skip Intro Button */}
      {showSkipIntro && (
        <button
          onClick={skipIntro}
          className="absolute bottom-24 right-8 px-6 py-3 bg-white/90 text-black font-semibold rounded-lg shadow-lg hover:bg-white transition-all animate-in slide-in-from-right"
        >
          Intro überspringen
        </button>
      )}

      {/* Next Episode Countdown */}
      {showNextEpisode && nextEpisode && (
        <div className="absolute bottom-24 right-8 bg-black/80 backdrop-blur-md rounded-lg p-4 max-w-xs animate-in slide-in-from-right">
          <p className="text-xs text-muted-foreground mb-2">Nächste Episode in {countdown}s</p>
          <div className="flex items-center gap-3">
            {nextEpisode.thumbnail && (
              <img 
                src={nextEpisode.thumbnail} 
                alt="" 
                className="w-16 h-10 object-cover rounded"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{nextEpisode.title}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button 
              size="sm" 
              className="flex-1 bg-section-accent hover:bg-section-accent/90"
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

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Top bar */}
        <div className="flex items-center gap-3 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 hover:bg-white/10 text-white"
            onClick={onClose}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-white truncate">{title}</p>
            {subtitle && <p className="text-xs text-white/60 truncate">{subtitle}</p>}
          </div>
          
          {/* Top right controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-white hover:bg-white/10"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings2 className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Settings Menu */}
        {showSettings && (
          <div className="absolute top-16 right-4 w-64 bg-black/90 backdrop-blur-md rounded-lg border border-white/10 overflow-hidden z-50">
            <div className="flex border-b border-white/10">
              <button
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  settingsTab === 'audio' ? 'text-white bg-white/10' : 'text-white/60 hover:text-white'
                }`}
                onClick={() => setSettingsTab('audio')}
              >
                <Languages className="h-4 w-4 inline mr-2" />
                Audio
              </button>
              <button
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  settingsTab === 'subtitles' ? 'text-white bg-white/10' : 'text-white/60 hover:text-white'
                }`}
                onClick={() => setSettingsTab('subtitles')}
              >
                <Subtitles className="h-4 w-4 inline mr-2" />
                Untertitel
              </button>
              {availableQualities.length > 0 && (
                <button
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${
                    settingsTab === 'quality' ? 'text-white bg-white/10' : 'text-white/60 hover:text-white'
                  }`}
                  onClick={() => setSettingsTab('quality')}
                >
                  <span className="text-xs">HD</span>
                  Qualität
                </button>
              )}
            </div>
            
            <div className="p-2 max-h-64 overflow-y-auto">
              {settingsTab === 'audio' && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground px-3 py-2">Wiedergabegeschwindigkeit</p>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      className={`w-full px-3 py-2 text-left text-sm rounded transition-colors ${
                        playbackRate === rate ? 'bg-section-accent text-white' : 'hover:bg-white/5 text-white/80'
                      }`}
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.playbackRate = rate;
                        }
                      }}
                    >
                      {rate === 1 ? 'Normal' : `${rate}x`}
                    </button>
                  ))}
                </div>
              )}
              
              {settingsTab === 'subtitles' && (
                <div className="space-y-1">
                  <button
                    className={`w-full px-3 py-2 text-left text-sm rounded transition-colors ${
                      currentTextTrack === -1 ? 'bg-section-accent text-white' : 'hover:bg-white/5 text-white/80'
                    }`}
                    onClick={() => {
                      const video = videoRef.current;
                      if (video) {
                        Array.from(video.textTracks).forEach((t, i) => {
                          t.mode = i === -1 ? 'showing' : 'hidden';
                        });
                        setCurrentTextTrack(-1);
                      }
                    }}
                  >
                    Aus
                  </button>
                  {textTracks.map((track, index) => (
                    <button
                      key={index}
                      className={`w-full px-3 py-2 text-left text-sm rounded transition-colors ${
                        currentTextTrack === index ? 'bg-section-accent text-white' : 'hover:bg-white/5 text-white/80'
                      }`}
                      onClick={() => setCurrentTextTrack(index)}
                    >
                      {track.label}
                    </button>
                  ))}
                </div>
              )}
              
              {settingsTab === 'quality' && availableQualities.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground px-3 py-2">Videoqualität</p>
                  {availableQualities.map((quality) => (
                    <button
                      key={quality.label}
                      className={`w-full px-3 py-2 text-left text-sm rounded transition-colors ${
                        currentQuality?.label === quality.label 
                          ? 'bg-section-accent text-white' 
                          : 'hover:bg-white/5 text-white/80'
                      }`}
                      onClick={() => onQualityChange?.(quality)}
                    >
                      <div className="flex items-center justify-between">
                        <span>{quality.label}</span>
                        <span className="text-xs text-white/50">
                          {quality.width}p
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom controls */}
        <div className="bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 space-y-3">
          {/* Progress bar */}
          <div 
            className="relative h-1.5 bg-white/20 rounded-full cursor-pointer group/progress"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              handleSeek(percent * duration);
            }}
            onMouseMove={handleScrubHover}
            onMouseLeave={() => setScrubPreview(null)}
          >
            {/* Buffered bar */}
            <div 
              className="absolute h-full bg-white/30 rounded-full"
              style={{ width: `${bufferedPercent}%` }}
            />
            
            {/* Progress bar */}
            <div 
              className="absolute h-full bg-section-accent rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
            
            {/* Scrub handle */}
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity"
              style={{ left: `${progressPercent}%`, transform: `translateX(-50%) translateY(-50%)` }}
            />
            
            {/* Preview tooltip */}
            {scrubPreview && duration > 0 && (
              <div 
                className="absolute -top-10 px-2 py-1 bg-black/80 text-white text-xs rounded pointer-events-none"
                style={{ left: scrubPreview.x, transform: 'translateX(-50%)' }}
              >
                {formatDuration(scrubPreview.time)}
              </div>
            )}
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between">
            {/* Left controls */}
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10 text-white hover:bg-white/10"
                onClick={togglePlay}
              >
                {isPlaying
                  ? <Pause className="h-5 w-5 fill-current" />
                  : <Play className="h-5 w-5 fill-current ml-0.5" />}
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 text-white hover:bg-white/10"
                onClick={() => skip(-10)}
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 text-white hover:bg-white/10"
                onClick={() => skip(10)}
              >
                <SkipForward className="h-4 w-4" />
              </Button>

              {/* Volume */}
              <div className="flex items-center gap-2 group/volume">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9 text-white hover:bg-white/10"
                  onClick={toggleMute}
                >
                  <VolumeIcon className="h-4 w-4" />
                </Button>
                <div className="w-0 overflow-hidden group-hover/volume:w-20 transition-all">
                  <Slider 
                    value={isMuted ? 0 : volume} 
                    max={1} 
                    onChange={handleVolume} 
                    className="w-20"
                  />
                </div>
              </div>

              {/* Time */}
              <span className="text-sm text-white/80 tabular-nums ml-2">
                {formatDuration(seek)} / {formatDuration(duration)}
              </span>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 text-white hover:bg-white/10"
                onClick={togglePiP}
                title="Bild-in-Bild"
              >
                <PictureInPicture2 className="h-4 w-4" />
              </Button>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 text-white hover:bg-white/10"
                onClick={toggleFullscreen}
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
