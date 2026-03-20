import { useRef, useState, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import { useVideoPlayerStore } from '@/stores/videoPlayerStore';
import { usePlayerStore } from '@/stores/playerStore';
import { formatDuration } from '@/lib/utils';
import {
  Play, Pause, Volume2, VolumeX, Maximize, SkipBack, SkipForward, ChevronDown, Square,
  Languages, Captions,
} from 'lucide-react';

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

function parseVtt(vttText: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = vttText.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const timeLine = lines.find(l => l.includes('-->'));
    if (!timeLine) continue;
    const [startStr, endStr] = timeLine.split('-->').map(s => s.trim());
    const parseTime = (t: string) => {
      // Only take the time portion before any positioning cues (e.g. "align:start")
      const timeOnly = t.split(' ')[0].replace(',', '.');
      const parts = timeOnly.split(':').map(parseFloat);
      return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
    };
    // Strip VTT/HTML tags (e.g. <i>, <b>, <c.yellow>, <00:00:00.000>)
    const text = lines.slice(lines.indexOf(timeLine) + 1).join('\n').trim()
      .replace(/<[^>]+>/g, '');
    if (text) cues.push({ start: parseTime(startStr), end: parseTime(endStr), text });
  }
  return cues;
}

interface AudioTrackInfo {
  index: number;
  codec: string;
  language?: string;
  channels: number;
  default: boolean;
}

interface SubtitleTrackInfo {
  index: number;
  codec: string;
  language?: string;
  title?: string;
  default: boolean;
  forced: boolean;
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
  mediaType?: 'movie' | 'episode';
  mediaId?: string;
}

function trackLabel(t: AudioTrackInfo | SubtitleTrackInfo, idx: number): string {
  const lang = t.language ? t.language.toUpperCase() : `Spur ${idx + 1}`;
  const extra = 'channels' in t
    ? `${(t as AudioTrackInfo).channels}ch · ${t.codec.toUpperCase()}`
    : (t as SubtitleTrackInfo).forced ? 'Erzwungen' : t.codec.toUpperCase();
  const name = 'title' in t && t.title ? ` · ${t.title}` : '';
  return `${lang}${name} (${extra})`;
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
  mediaType,
  mediaId,
}: VideoPlayerProps) {
  const { minimize, updateProgress, stop } = useVideoPlayerStore();
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
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const [countdown] = useState(5);

  // Track state
  const [audioTracks, setAudioTracks] = useState<AudioTrackInfo[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrackInfo[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<number | null>(null);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number | null>(null);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);

  // HLS instance (used when direct play is not possible)
  const hlsRef = useRef<Hls | null>(null);

  // Refs so init effect can check without adding deps
  const mediaTypeRef = useRef(mediaType);
  mediaTypeRef.current = mediaType;
  const mediaIdRef = useRef(mediaId);
  mediaIdRef.current = mediaId;

  // Audio stream offset tracking (for ffmpeg-piped audio streams)
  const streamOffsetRef = useRef(0);
  const isSwitchingAudio = useRef(false);
  const audioTrackInitialized = useRef(false);

  // Subtitle overlay state
  const subtitleCuesRef = useRef<SubtitleCue[]>([]);
  const currentCueRef = useRef<string | null>(null);
  const [currentCueText, setCurrentCueText] = useState<string | null>(null);

  // Stable refs so timeupdate effect never needs to re-register
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const updateProgressRef = useRef(updateProgress);
  updateProgressRef.current = updateProgress;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const introStartRef = useRef(introStart);
  introStartRef.current = introStart;
  const introEndRef = useRef(introEnd);
  introEndRef.current = introEnd;
  const nextEpisodeRef = useRef(nextEpisode);
  nextEpisodeRef.current = nextEpisode;

  // Fetch track info and determine correct stream URL (direct play vs. HLS transcode)
  useEffect(() => {
    if (!mediaType || !mediaId) return;
    audioTrackInitialized.current = false;

    fetch(`/api/video/stream/info/${mediaType}/${mediaId}`)
      .then(r => r.json())
      .then(json => {
        const data = json?.data;
        const info = data?.mediaInfo;
        if (!info) return;

        const audio: AudioTrackInfo[] = info.audio ?? [];
        const subs: SubtitleTrackInfo[] = info.subtitles ?? [];
        setAudioTracks(audio);
        setSubtitleTracks(subs);
        const defAudioIdx = audio.findIndex((a: AudioTrackInfo) => a.default);
        const resolvedIdx = defAudioIdx >= 0 ? defAudioIdx : audio.length > 0 ? 0 : null;
        audioTrackInitialized.current = true;
        setSelectedAudio(resolvedIdx);
        setSelectedSubtitle(null);

        const streamUrl: string = data?.streamUrl ?? src;
        const video = videoRef.current;
        if (!video) return;

        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }

        const startPlay = () => {
          video.play().catch(() => {
            video.muted = true;
            setIsMuted(true);
            video.play().catch(() => {});
          });
        };

        if (streamUrl.includes('.m3u8')) {
          // Transcode path — pause the direct-play stream and hand over to hls.js
          video.pause();
          if (Hls.isSupported()) {
            const hls = new Hls();
            hlsRef.current = hls;
            hls.loadSource(streamUrl);
            hls.attachMedia(video);
            hls.once(Hls.Events.MANIFEST_PARSED, startPlay);
          } else {
            // Safari: native HLS
            video.src = streamUrl;
            startPlay();
          }
          return;
        }

        // Direct play: check if default audio track is browser-decodable.
        // Chrome cannot decode AC3/EAC3/DTS/TrueHD natively — if the default track
        // uses one of these codecs, switch immediately to the server-side AAC transcode.
        const NATIVE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'alac', 'pcm_s16le', 'pcm_s24le']);
        const defaultTrack = resolvedIdx !== null ? audio[resolvedIdx] : null;
        const needsAudioTranscode = defaultTrack != null && !NATIVE_AUDIO.has(defaultTrack.codec.toLowerCase());

        if (needsAudioTranscode && resolvedIdx !== null) {
          // Auto-switch to the ffmpeg audio transcode endpoint so the user hears sound.
          // streamOffsetRef ensures the displayed playback position stays correct.
          streamOffsetRef.current = savedPosition;
          isSwitchingAudio.current = true;
          setIsLoading(true);
          video.src = `/api/video/stream/audio/${mediaType}/${mediaId}?track=${resolvedIdx}&start=${savedPosition}`;
          video.load();
          return;
        }

        // Compatible audio — init effect's video.play() already started playback.
      })
      .catch(() => {
        // Info fetch failed — fall back to direct play
        videoRef.current?.play().catch(() => {});
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaType, mediaId, src]);

  // Clear overlay when subtitle is turned off
  useEffect(() => {
    if (selectedSubtitle === null) {
      subtitleCuesRef.current = [];
      currentCueRef.current = null;
      setCurrentCueText(null);
    }
  }, [selectedSubtitle]);

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

    // Always start playback immediately while the user-gesture activation is valid.
    // For direct play this is the primary play() call.
    // For HLS the info-fetch effect will pause, reinit hls.js, then play again.
    video.play().catch(() => {
      video.muted = true;
      setIsMuted(true);
      video.play().catch(() => {});
    });

    const onLoaded = () => {
      const dur = isFinite(video.duration) && video.duration > 0 ? video.duration : (propDuration || 0);
      if (dur > 0) setDuration(dur);
      setIsLoading(false);

      if (isSwitchingAudio.current) {
        isSwitchingAudio.current = false;
        video.play().catch(() => {});
        return;
      }

      if (savedPosition > 0 && savedPosition < dur - 5) {
        video.currentTime = savedPosition;
      }
    };

    video.addEventListener('loadedmetadata', onLoaded);

    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPosition, pause, propDuration]);

  // Sync playback — deps kept minimal via refs so listeners never re-register needlessly
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      const realTime = video.currentTime + streamOffsetRef.current;
      setSeek(realTime);
      onProgressRef.current?.(Math.floor(realTime));
      updateProgressRef.current(realTime, durationRef.current);

      const iStart = introStartRef.current;
      const iEnd   = introEndRef.current;
      if (iStart != null && iEnd != null) {
        setShowSkipIntro(realTime >= iStart && realTime < iEnd - 5);
      }

      const dur = durationRef.current;
      setShowNextEpisode(!!(nextEpisodeRef.current && dur > 0 && realTime > dur - 30));

      // Subtitle overlay
      const cues = subtitleCuesRef.current;
      if (cues.length > 0) {
        const active = cues.find(c => realTime >= c.start && realTime <= c.end);
        const text = active?.text ?? null;
        if (text !== currentCueRef.current) {
          currentCueRef.current = text;
          setCurrentCueText(text);
        }
      }
    };

    const onPlay  = () => { setIsPlaying(true);  resetHideTimer(); };
    const onPause = () => { setIsPlaying(false); setShowControls(true); };
    const onEnded = () => { setIsPlaying(false); setShowControls(true); onCompleteRef.current?.(); };

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('play',       onPlay);
    video.addEventListener('pause',      onPause);
    video.addEventListener('ended',      onEnded);

    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('play',       onPlay);
      video.removeEventListener('pause',      onPause);
      video.removeEventListener('ended',      onEnded);
    };
  }, [resetHideTimer]); // stable — all other values read through refs

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.paused ? video.play() : video.pause();
    resetHideTimer();
  };

  const handleSeek = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const localTime = Math.max(0, seconds - streamOffsetRef.current);
    video.currentTime = localTime;
    setSeek(seconds);
    resetHideTimer();
  };

  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const newLocal = Math.max(0, Math.min(
      isFinite(video.duration) ? video.duration : Infinity,
      video.currentTime + seconds,
    ));
    video.currentTime = newLocal;
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

  // Destroy HLS instance when VideoPlayer unmounts
  useEffect(() => () => { hlsRef.current?.destroy(); }, []);

  const handleStop = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    hlsRef.current?.destroy();
    hlsRef.current = null;
    stop();
    onClose();
  }, [onClose, stop]);

  const skipIntro = () => {
    if (introEnd) {
      handleSeek(introEnd);
      setShowSkipIntro(false);
    }
  };

  const selectAudioTrack = (idx: number) => {
    setSelectedAudio(idx);
    setShowAudioMenu(false);

    if (!mediaType || !mediaId) return;
    const video = videoRef.current;
    if (!video) return;

    // Destroy HLS before switching to the ffmpeg audio-transcode stream
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const realPos = Math.floor(video.currentTime + streamOffsetRef.current);
    streamOffsetRef.current = realPos;
    isSwitchingAudio.current = true;
    setIsLoading(true);
    video.src = `/api/video/stream/audio/${mediaType}/${mediaId}?track=${idx}&start=${realPos}`;
    video.load();
  };

  const selectSubtitleTrack = (idx: number | null) => {
    setSelectedSubtitle(idx);
    setShowSubtitleMenu(false);
    subtitleCuesRef.current = [];
    currentCueRef.current = null;
    setCurrentCueText(null);

    if (idx === null || !mediaType || !mediaId) return;
    const track = subtitleTracks[idx];
    if (!track) return;

    fetch(`/api/video/stream/subtitle/${mediaType}/${mediaId}/${track.index}`)
      .then(r => r.text())
      .then(vttText => { subtitleCuesRef.current = parseVtt(vttText); })
      .catch(() => {});
  };

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
          handleStop();
          break;
      }
      resetHideTimer();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resetHideTimer, handleStop]);

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
          playsInline
        />

        {/* Loading */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="h-12 w-12 rounded-full border-4 border-white/20 border-t-red-600 animate-spin" />
          </div>
        )}

        {/* Subtitle overlay */}
        {currentCueText && (
          <div className="absolute bottom-20 left-0 right-0 flex justify-center pointer-events-none px-6">
            <div className="bg-black/80 text-white text-sm px-4 py-1.5 rounded text-center max-w-2xl leading-relaxed">
              {currentCueText.split('\n').map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
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
          <button onClick={minimize} className="text-white/80 hover:text-white p-2" title="Minimieren">
            <ChevronDown className="h-6 w-6" />
          </button>
          <button onClick={toggleFullscreen} className="text-white/80 hover:text-white p-2" title="Vollbild">
            <Maximize className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Control Bar */}
      <div
        className={`bg-[#1a1a1a] h-16 relative transition-all duration-300 ${showControls ? 'translate-y-0' : 'translate-y-full'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress Bar */}
        <div
          className="absolute top-0 left-0 right-0 h-1 bg-white/20 cursor-pointer group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            handleSeek(percent * duration);
          }}
        >
          <div
            className="h-full bg-red-600 transition-all group-hover:h-1.5"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Controls Row */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center h-full px-4 gap-2">
          {/* Left: Info */}
          <div className="flex items-center gap-3 min-w-0">
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
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={() => skip(-10)}
              className="flex flex-col items-center justify-center w-10 h-10 text-white hover:bg-white/10 rounded"
            >
              <SkipBack className="h-4 w-4" />
              <span className="text-[8px] -mt-1">10</span>
            </button>

            <button
              onClick={togglePlay}
              className="flex items-center justify-center w-12 h-12 bg-white text-black rounded-full hover:scale-105 transition-transform mx-1"
            >
              {isPlaying
                ? <Pause className="h-6 w-6 fill-current" />
                : <Play className="h-6 w-6 fill-current ml-0.5" />}
            </button>

            <button
              onClick={() => skip(10)}
              className="flex flex-col items-center justify-center w-10 h-10 text-white hover:bg-white/10 rounded"
            >
              <SkipForward className="h-4 w-4" />
              <span className="text-[8px] -mt-1">10</span>
            </button>

            <button
              onClick={handleStop}
              className="flex items-center justify-center w-10 h-10 text-white hover:bg-white/10 rounded ml-1"
              title="Stop"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>

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

          {/* Right: Track selectors + Volume */}
          <div className="flex items-center justify-end gap-1">

            {/* Audio Track Selector */}
            {audioTracks.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => { setShowAudioMenu(v => !v); setShowSubtitleMenu(false); }}
                  className={`flex items-center justify-center w-9 h-9 rounded hover:bg-white/10 transition-colors ${showAudioMenu ? 'text-white' : 'text-white/60'}`}
                  title="Audiospur"
                >
                  <Languages className="h-4 w-4" />
                </button>
                {showAudioMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-[#2a2a2a] border border-white/10 rounded-lg shadow-xl min-w-[200px] py-1 z-10">
                    <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">Audiospur</p>
                    {audioTracks.map((t, i) => (
                      <button
                        key={t.index}
                        onClick={() => selectAudioTrack(i)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors ${selectedAudio === i ? 'text-white' : 'text-white/70'}`}
                      >
                        <span className={`inline-block w-3 h-3 rounded-full border mr-2 align-middle ${selectedAudio === i ? 'bg-red-500 border-red-500' : 'border-white/30'}`} />
                        {trackLabel(t, i)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Subtitle Track Selector */}
            {subtitleTracks.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => { setShowSubtitleMenu(v => !v); setShowAudioMenu(false); }}
                  className={`flex items-center justify-center w-9 h-9 rounded hover:bg-white/10 transition-colors ${selectedSubtitle !== null ? 'text-white' : showSubtitleMenu ? 'text-white' : 'text-white/60'}`}
                  title="Untertitel"
                >
                  <Captions className="h-4 w-4" />
                </button>
                {showSubtitleMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-[#2a2a2a] border border-white/10 rounded-lg shadow-xl min-w-[200px] py-1 z-10">
                    <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">Untertitel</p>
                    <button
                      onClick={() => selectSubtitleTrack(null)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors ${selectedSubtitle === null ? 'text-white' : 'text-white/70'}`}
                    >
                      <span className={`inline-block w-3 h-3 rounded-full border mr-2 align-middle ${selectedSubtitle === null ? 'bg-red-500 border-red-500' : 'border-white/30'}`} />
                      Aus
                    </button>
                    {subtitleTracks.map((s, i) => (
                      <button
                        key={s.index}
                        onClick={() => selectSubtitleTrack(i)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors ${selectedSubtitle === i ? 'text-white' : 'text-white/70'}`}
                      >
                        <span className={`inline-block w-3 h-3 rounded-full border mr-2 align-middle ${selectedSubtitle === i ? 'bg-red-500 border-red-500' : 'border-white/30'}`} />
                        {trackLabel(s, i)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Volume */}
            <div className="flex items-center gap-2 ml-1">
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
          </div>
        </div>
      </div>
    </div>
  );
}
