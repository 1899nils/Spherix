import { useRef, useState, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import { useVideoPlayerStore } from '@/stores/videoPlayerStore';
import { usePlayerStore } from '@/stores/playerStore';
import { formatDuration } from '@/lib/utils';
import { clientCapabilitiesHeader } from '@/lib/clientCapabilities';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  ChevronDown,
  Square,
  Languages,
  Captions,
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
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [startStr, endStr] = timeLine.split('-->').map((s) => s.trim());
    const parseTime = (t: string) => {
      const timeOnly = t.split(' ')[0].replace(',', '.');
      const parts = timeOnly.split(':').map(parseFloat);
      return parts.length === 3
        ? parts[0] * 3600 + parts[1] * 60 + parts[2]
        : parts[0] * 60 + parts[1];
    };
    const text = lines
      .slice(lines.indexOf(timeLine) + 1)
      .join('\n')
      .trim()
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
  /** Portrait artwork, used for the small thumbnail in the control bar. */
  posterUrl?: string | null;
  /** Landscape artwork, shown filling the frame until playback starts. */
  backdropUrl?: string | null;
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
  const extra =
    'channels' in t
      ? `${(t as AudioTrackInfo).channels}ch · ${t.codec.toUpperCase()}`
      : (t as SubtitleTrackInfo).forced
        ? 'Erzwungen'
        : t.codec.toUpperCase();
  const name = 'title' in t && t.title ? ` · ${t.title}` : '';
  return `${lang}${name} (${extra})`;
}

/** Seconds of playback between progress reports to the server. */
const PROGRESS_REPORT_INTERVAL = 10;

/**
 * Tell the server this media is no longer being watched, so it can stop any
 * transcode still running for it. Best-effort: the server also reaps jobs
 * whose client has gone quiet, which covers a closed tab or a crash.
 *
 * Uses sendBeacon where available because this is often called while the
 * page is going away, when a normal fetch is liable to be cancelled.
 */
function notifyPlaybackStopped(mediaType?: string, mediaId?: string): void {
  if (!mediaType || !mediaId) return;
  const url = `/api/video/stream/stop/${mediaType}/${mediaId}`;
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url);
      return;
    }
  } catch {
    // fall through to fetch
  }
  fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
}

/** How often the stall watchdog samples playback position, in ms. */
const STALL_CHECK_INTERVAL = 1000;
/** Time with buffered data but no progress before we call it a decode failure. */
const STALL_TIMEOUT = 12000;

// Image-based subtitle codecs that cannot be converted to WebVTT.
const IMAGE_SUB_CODECS = new Set([
  'hdmv_pgs_subtitle',
  'pgssub',
  'pgs',
  'dvd_subtitle',
  'dvbsub',
  'dvb_subtitle',
  'vobsub',
]);

export function VideoPlayer({
  src,
  title,
  subtitle,
  posterUrl,
  backdropUrl,
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Two distinct "not playing yet" states, because they want different UI:
  // `isLoading` is the initial negotiation (backdrop + spinner, no picture
  // to show yet), `isBuffering` is a mid-playback stall where the frame is
  // still there and only a spinner belongs on top of it.
  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  // HLS instance
  const hlsRef = useRef<Hls | null>(null);

  // Stable refs for media identity
  const mediaTypeRef = useRef(mediaType);
  mediaTypeRef.current = mediaType;
  const mediaIdRef = useRef(mediaId);
  mediaIdRef.current = mediaId;

  // Audio track the stream currently carries. Chosen server-side — see
  // selectAudioTrack() — so this is only ever what the last /info response
  // reported back, never something the client applies on its own.
  const selectedAudioRef = useRef<number | null>(null);

  // Position to restore once the next source has loaded its metadata. Set
  // when a reload is deliberate (audio-track switch, transcode fallback) so
  // playback picks up where it left off instead of jumping to the start.
  const pendingSeekRef = useRef<number | null>(null);
  // savedPosition is restored exactly once, on the first source that loads.
  const hasRestoredPositionRef = useRef(false);
  // True from the moment a (re)load starts until the new source is playable.
  // Swapping sources tears the old one down, and the teardown can raise a
  // media error on the element that has nothing to do with the source now
  // being loaded — without this guard that noise surfaced as a "cannot be
  // played" message over a stream that was about to start fine.
  const isReloadingRef = useRef(false);

  // Whether the <video> element currently holds a direct-play source (as
  // opposed to an HLS one) — used to decide whether a decode error should
  // trigger the transcode fallback below.
  const isDirectPlayRef = useRef(false);
  // Only fall back once per media — if the transcoded stream *also* fails
  // to decode, retrying forever isn't going to help.
  const hasFallenBackToTranscodeRef = useRef(false);
  // hls.js gets one recoverMediaError() attempt before we give up on the
  // stream and re-request it as a transcode.
  const mediaRecoveryTriedRef = useRef(false);
  // ...and one startLoad() attempt after a fatal network error before the
  // failure is shown to the viewer.
  const networkRecoveryTriedRef = useRef(false);

  // Playback position last reported upwards, so `timeupdate` (which fires
  // several times a second) doesn't turn into a request per tick.
  const lastProgressReportRef = useRef(0);
  // Holds the latest "(re)fetch /stream/info and load whatever it says"
  // function from the info-fetch effect below, so the decode-error handler
  // in a different effect can trigger it with forceTranscode=true.
  const loadStreamRef = useRef<(opts?: { forceTranscode?: boolean; audioTrack?: number }) => void>(
    () => {},
  );

  // Subtitle overlay
  const subtitleCuesRef = useRef<SubtitleCue[]>([]);
  const currentCueRef = useRef<string | null>(null);
  const [currentCueText, setCurrentCueText] = useState<string | null>(null);

  // Stable refs to avoid re-registering event listeners
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

  // ─── Info fetch: detect codec and choose stream path ───────────────────────

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // No mediaType/mediaId means the caller isn't using the direct-play/
    // transcode negotiation at all — just play whatever `src` was given.
    if (!mediaType || !mediaId) {
      video.src = src;
      video.play().catch(() => {
        video.muted = true;
        setIsMuted(true);
        video.play().catch(() => {});
      });
      return;
    }

    hasFallenBackToTranscodeRef.current = false;
    mediaRecoveryTriedRef.current = false;
    networkRecoveryTriedRef.current = false;

    const controller = new AbortController();
    const playWithMuteFallback = () => {
      video.play().catch(() => {
        video.muted = true;
        setIsMuted(true);
        video.play().catch(() => {});
      });
    };

    // Fetches /stream/info and loads whatever it says to. Called once on
    // mount, and again with forceTranscode=true if a direct-play attempt
    // reports a real decode error (see the "Initialize video" effect below)
    // — canPlayType() (used to decide what capabilities to report to the
    // server) is only ever a heuristic, not a guarantee.
    const loadStream = (opts: { forceTranscode?: boolean; audioTrack?: number } = {}) => {
      const params = new URLSearchParams();
      if (opts.forceTranscode) params.set('forceTranscode', '1');
      if (opts.audioTrack != null) params.set('audioTrack', String(opts.audioTrack));
      const qs = params.size > 0 ? `?${params}` : '';

      // Every path through here ends with the browser having to fetch and
      // decode a source it doesn't have yet, which is exactly the wait the
      // spinner exists for. Raising it here rather than only on mount is
      // what makes an audio-track switch or a transcode fallback show
      // progress instead of an apparently frozen picture.
      setIsLoading(true);
      setLoadError(null);
      isReloadingRef.current = true;

      fetch(`/api/video/stream/info/${mediaType}/${mediaId}${qs}`, {
        signal: controller.signal,
        headers: { 'x-client-capabilities': clientCapabilitiesHeader() },
      })
        .then((r) => {
          if (!r.ok) throw new Error(`Stream-Info fehlgeschlagen (HTTP ${r.status})`);
          return r.json();
        })
        .then((json) => {
          if (controller.signal.aborted) return;
          const data = json?.data;
          const info = data?.mediaInfo;
          if (!info) throw new Error('Keine Medieninformationen erhalten');

          const audio: AudioTrackInfo[] = info.audio ?? [];
          const subs: SubtitleTrackInfo[] = (info.subtitles ?? []).filter(
            (s: SubtitleTrackInfo) => !IMAGE_SUB_CODECS.has(s.codec.toLowerCase()),
          );

          setAudioTracks(audio);
          setSubtitleTracks(subs);

          // The server reports which track the stream it just handed back
          // actually carries. Trusting that rather than re-deriving it here
          // keeps the menu's checked entry honest even when the requested
          // track was out of range and the server fell back to the default.
          const resolvedIdx: number | null =
            typeof data?.audioTrack === 'number' && data.audioTrack >= 0 ? data.audioTrack : null;
          selectedAudioRef.current = resolvedIdx;
          setSelectedAudio(resolvedIdx);

          const streamUrl: string = data?.streamUrl ?? src;
          const directPlay: boolean = data?.directPlay ?? true;
          isDirectPlayRef.current = directPlay;

          if (!directPlay) {
            if (hlsRef.current) {
              hlsRef.current.destroy();
              hlsRef.current = null;
            }
            video.pause();

            // ── HLS transcode path (video/container incompatible) ───────────
            if (streamUrl.includes('.m3u8')) {
              if (Hls.isSupported()) {
                const hls = new Hls({
                  // The server can take up to ~30s to hand back the
                  // playlist while it waits for ffmpeg to produce the
                  // first HLS segment (see the /hls/.../playlist.m3u8
                  // route). hls.js's 10s default manifest-loading timeout
                  // was well short of that, so it would give up and retry
                  // before the server ever got a chance to respond —
                  // visible as repeated NS_BINDING_ABORTED requests for
                  // the same playlist URL.
                  manifestLoadingTimeOut: 35000,
                  manifestLoadingMaxRetry: 3,
                  manifestLoadingRetryDelay: 2000,
                  // Buffer generously. The source here is a transcode being
                  // written live, so the default (fairly tight) buffer left
                  // playback repeatedly running up against however far
                  // ffmpeg happened to have got — the stutter that was
                  // reported even once CPU load was no longer the problem.
                  maxBufferLength: 60,
                  maxMaxBufferLength: 120,
                  backBufferLength: 30,
                });
                hlsRef.current = hls;

                // MSE decode failures do NOT surface as a `video.error` —
                // they arrive here, as fatal hls.js media errors. Without
                // this the transcode fallback below could never fire for an
                // HLS stream: the browser had told us via
                // MediaSource.isTypeSupported() that it could handle the
                // codec, hls.js dutifully fed it segments, and playback just
                // sat there while the media element itself reported nothing.
                hls.on(Hls.Events.ERROR, (_evt, data) => {
                  if (!data.fatal) return;

                  if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    // Give hls.js one chance to recover on its own — a
                    // single bad append is often transient.
                    if (!hasFallenBackToTranscodeRef.current && !mediaRecoveryTriedRef.current) {
                      mediaRecoveryTriedRef.current = true;
                      console.warn(
                        '[VideoPlayer] Fatal HLS media error, attempting recovery',
                        data,
                      );
                      hls.recoverMediaError();
                      return;
                    }
                    if (!hasFallenBackToTranscodeRef.current) {
                      hasFallenBackToTranscodeRef.current = true;
                      console.warn(
                        '[VideoPlayer] HLS cannot decode this stream, forcing a transcode',
                        data,
                      );
                      hls.destroy();
                      hlsRef.current = null;
                      loadStreamRef.current({ forceTranscode: true });
                    }
                    return;
                  }

                  // Everything that isn't a media error used to be dropped
                  // on the floor here, and a fatal network error is the one
                  // this player runs into in practice: when ffmpeg hasn't
                  // produced enough segments within its window the playlist
                  // route answers 503, hls.js exhausts its manifest retries,
                  // and reports exactly this. With no handler the player sat
                  // on the loading spinner indefinitely with nothing on
                  // screen to say why — the "sometimes it just doesn't
                  // load" case. hls.js can restart the load itself, so give
                  // it one go before surfacing anything to the viewer.
                  if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    if (!networkRecoveryTriedRef.current) {
                      networkRecoveryTriedRef.current = true;
                      console.warn('[VideoPlayer] Fatal HLS network error, retrying', data);
                      hls.startLoad();
                      return;
                    }
                    setIsLoading(false);
                    setLoadError(
                      'Der Stream konnte nicht geladen werden. Die Umwandlung dauert ' +
                        'möglicherweise noch an.',
                    );
                    return;
                  }

                  console.error('[VideoPlayer] Unrecoverable HLS error', data);
                  hls.destroy();
                  hlsRef.current = null;
                  setIsLoading(false);
                  setLoadError('Die Wiedergabe ist fehlgeschlagen.');
                });

                hls.loadSource(streamUrl);
                hls.attachMedia(video);
                hls.once(Hls.Events.MANIFEST_PARSED, playWithMuteFallback);
              } else {
                video.src = streamUrl;
                playWithMuteFallback();
              }
              return;
            }

            // Anything else the server hands back that isn't a playlist is
            // a plain progressive source — load it directly.
            video.src = streamUrl;
            video.load();
            playWithMuteFallback();
            return;
          }

          // ── Direct play ────────────────────────────────────────────────────
          // The <video> element has no `src` until this resolves (see
          // render), so this is the only thing that ever starts direct
          // playback — no race with a second effect trying to play a
          // not-yet-decided source.
          video.src = streamUrl;
          video.load();
          playWithMuteFallback();
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          console.warn('[VideoPlayer] Stream negotiation failed, trying the raw source', err);
          // Info request failed — fall back to playing `src` directly rather
          // than leaving the player stuck with no source at all.
          isDirectPlayRef.current = true;
          video.src = src;
          video.load();
          playWithMuteFallback();
        });
    };

    loadStreamRef.current = loadStream;
    loadStream();

    return () => {
      controller.abort();
    };
  }, [mediaType, mediaId, src]);

  // ─── Clear subtitle overlay when disabled ──────────────────────────────────

  useEffect(() => {
    if (selectedSubtitle === null) {
      subtitleCuesRef.current = [];
      currentCueRef.current = null;
      setCurrentCueText(null);
    }
  }, [selectedSubtitle]);

  // ─── Stall watchdog ────────────────────────────────────────────────────────
  //
  // Last line of defence against a stream that arrives fine but never
  // actually decodes. Neither of the error paths we already handle catches
  // that case: the media element reports no `error` (so the direct-play
  // fallback stays silent), and hls.js reports no fatal MEDIA_ERROR either
  // (so that fallback stays silent too) — it happily keeps fetching and
  // appending segments while nothing is rendered and the clock never moves.
  // Observed exactly this with HEVC in Firefox: ~106MB of segments pulled
  // over a minute and a half, no errors logged anywhere, no picture.
  //
  // So rather than trying to enumerate every way a browser can lie about
  // its decoding abilities, watch the thing that actually matters — whether
  // playback time advances — and force a transcode when it doesn't.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let lastTime = -1;
    let stalledFor = 0;

    const interval = setInterval(() => {
      if (video.paused || video.ended || hasFallenBackToTranscodeRef.current) {
        stalledFor = 0;
        lastTime = video.currentTime;
        return;
      }

      // Only count it as a stall when the browser actually has data to play:
      // waiting on the network is normal and not a decode problem.
      const hasData = video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
      if (video.currentTime === lastTime && hasData) {
        stalledFor += STALL_CHECK_INTERVAL;
      } else {
        stalledFor = 0;
      }
      lastTime = video.currentTime;

      if (stalledFor >= STALL_TIMEOUT) {
        hasFallenBackToTranscodeRef.current = true;
        console.warn(
          `[VideoPlayer] Playback stalled ${STALL_TIMEOUT / 1000}s with data buffered — ` +
            'the browser cannot decode this stream, forcing a transcode',
        );
        hlsRef.current?.destroy();
        hlsRef.current = null;
        loadStreamRef.current({ forceTranscode: true });
      }
    }, STALL_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [mediaType, mediaId, src]);

  // ─── Auto-hide controls ────────────────────────────────────────────────────

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 3000);
  }, []);

  // ─── Initialize video ──────────────────────────────────────────────────────

  useEffect(() => {
    pause();
    const video = videoRef.current;
    if (!video) return;

    const onLoaded = () => {
      const rawDur = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const dur = propDuration || (rawDur > 0 ? rawDur : 0);
      if (dur > 0) setDuration(dur);

      // A deliberate reload (audio-track switch, transcode fallback) parks
      // the position it interrupted here, and it wins over savedPosition —
      // resuming a switch at where the film was 40 minutes ago would be
      // worse than not offering the switch at all.
      const resumeAt = pendingSeekRef.current;
      if (resumeAt != null) {
        pendingSeekRef.current = null;
        if (resumeAt > 0 && (dur === 0 || resumeAt < dur - 1)) video.currentTime = resumeAt;
        video.play().catch(() => {});
        return;
      }

      // Only ever restore the saved position for a fresh source. Guarding
      // with a ref matters because this effect re-runs whenever its props
      // change, and re-running it while a film is playing would otherwise
      // yank playback back to wherever the viewer had got to last session.
      if (!hasRestoredPositionRef.current) {
        hasRestoredPositionRef.current = true;
        if (savedPosition > 0 && savedPosition < dur - 5) {
          video.currentTime = savedPosition;
        }
      }
    };

    // Metadata means "we know how long it is", not "there is a picture".
    // Clearing the spinner there left it disappearing well before anything
    // was actually on screen; `canplay`/`playing` are the events that mean
    // the browser has decodable data.
    const onPlayable = () => {
      isReloadingRef.current = false;
      setIsLoading(false);
      setIsBuffering(false);
      setLoadError(null);
    };
    // The browser ran out of data mid-playback. This is the case that
    // previously showed nothing at all — the picture simply froze.
    const onWaiting = () => {
      if (!video.ended) setIsBuffering(true);
    };

    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('canplay', onPlayable);
    video.addEventListener('playing', onPlayable);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onWaiting);

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      onLoaded();
    }

    const onError = () => {
      // Mid-swap errors belong to the source being torn down, not the one
      // being loaded — let the incoming load report its own outcome.
      if (isReloadingRef.current && !isDirectPlayRef.current) return;
      setIsLoading(false);
      setIsBuffering(false);

      // A genuine decode/format failure while attempting direct play means
      // canPlayType() (used client-side to decide what to report as
      // supported) was wrong about this browser actually being able to
      // handle the content — reload through the transcode path instead of
      // leaving the player stuck on a black/frozen frame. Only for a real
      // decode failure, not e.g. MEDIA_ERR_ABORTED from our own src/load()
      // reassignments elsewhere, and only once per media so a transcoded
      // stream that *also* fails to decode doesn't retry forever.
      const err = video.error;
      const isDecodeFailure =
        !!err &&
        (err.code === MediaError.MEDIA_ERR_DECODE ||
          err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED);
      if (isDecodeFailure && isDirectPlayRef.current && !hasFallenBackToTranscodeRef.current) {
        hasFallenBackToTranscodeRef.current = true;
        console.warn(
          '[VideoPlayer] Direct play reported a decode error, falling back to transcode',
          err,
        );
        pendingSeekRef.current = video.currentTime || null;
        loadStreamRef.current({ forceTranscode: true });
      } else if (isDecodeFailure) {
        setLoadError('Dieses Video kann nicht wiedergegeben werden.');
      }
    };
    video.addEventListener('error', onError);

    video.muted = false;
    video.volume = volume;

    // Playback itself is started by the info-fetch effect above, once it
    // knows the actual URL to use (direct play or HLS) — not here. This
    // effect used to call video.play() unconditionally on mount, racing
    // against that effect's later video.src/load() reassignment: whichever
    // `play()` promise was still pending when the source got swapped
    // rejected with "The fetching process for the media resource was
    // aborted by the user agent at the user's request", and the video would
    // visibly stall/restart once the correct source finally loaded.

    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('canplay', onPlayable);
      video.removeEventListener('playing', onPlayable);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onWaiting);
      video.removeEventListener('error', onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPosition, pause, propDuration]);

  // ─── Sync playback events ──────────────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTime = () => {
      const realTime = video.currentTime;
      setSeek(realTime);

      // `timeupdate` fires roughly 4x a second. Reporting progress on every
      // one of them meant ~4 POSTs/second, each of which the callers follow
      // with a query invalidation that refetches the whole movie — i.e.
      // ~8 requests a second, with a DB write behind each POST, competing
      // with the player's own segment downloads for the connection. Report
      // on a fixed interval instead; onPause/onEnded below flush the exact
      // final position so nothing is lost.
      if (realTime - lastProgressReportRef.current >= PROGRESS_REPORT_INTERVAL) {
        lastProgressReportRef.current = realTime;
        onProgressRef.current?.(Math.floor(realTime));
      }
      updateProgressRef.current(realTime, durationRef.current);

      const iStart = introStartRef.current;
      const iEnd = introEndRef.current;
      if (iStart != null && iEnd != null) {
        setShowSkipIntro(realTime >= iStart && realTime < iEnd - 5);
      }

      const dur = durationRef.current;
      setShowNextEpisode(!!(nextEpisodeRef.current && dur > 0 && realTime > dur - 30));

      // Subtitle overlay
      const cues = subtitleCuesRef.current;
      if (cues.length > 0) {
        const active = cues.find((c) => realTime >= c.start && realTime <= c.end);
        const text = active?.text ?? null;
        if (text !== currentCueRef.current) {
          currentCueRef.current = text;
          setCurrentCueText(text);
        }
      }
    };

    const onPlay = () => {
      setIsPlaying(true);
      resetHideTimer();
    };
    const onPause = () => {
      setIsPlaying(false);
      setShowControls(true);
      // Flush the exact position — onTime only reports on an interval.
      const realTime = video.currentTime;
      lastProgressReportRef.current = realTime;
      onProgressRef.current?.(Math.floor(realTime));
    };
    const onEnded = () => {
      setIsPlaying(false);
      setShowControls(true);
      onCompleteRef.current?.();
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
    };
  }, [resetHideTimer]);

  // ─── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(
    () => () => {
      hlsRef.current?.destroy();
      // Covers the ways playback ends without the stop button: navigating
      // away, closing the detail view, the component being unmounted.
      notifyPlaybackStopped(mediaTypeRef.current, mediaIdRef.current);
    },
    [],
  );

  // ─── Controls ──────────────────────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    resetHideTimer();
  }, [resetHideTimer]);

  const handleSeek = useCallback(
    (seconds: number) => {
      const video = videoRef.current;
      if (!video) return;
      const target = Math.max(0, Math.min(durationRef.current || Infinity, seconds));
      video.currentTime = target;
      setSeek(target);
      resetHideTimer();
    },
    [resetHideTimer],
  );

  const skip = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video) return;
      handleSeek(video.currentTime + delta);
    },
    [handleSeek],
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    // Read the element rather than component state: this is also driven
    // from the keyboard handler, whose listener is registered once, so a
    // captured `isMuted` would be frozen at its mount value and 'm' would
    // only ever mute, never unmute.
    const newMuted = !video.muted;
    video.muted = newMuted;
    setIsMuted(newMuted);
    resetHideTimer();
  }, [resetHideTimer]);

  const handleVolume = useCallback(
    (v: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.volume = v;
      video.muted = v === 0;
      setVolume(v);
      setIsMuted(v === 0);
      resetHideTimer();
    },
    [resetHideTimer],
  );

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const handleStop = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = 0;
    }
    hlsRef.current?.destroy();
    hlsRef.current = null;
    // Release the server-side transcode straight away — otherwise it keeps
    // encoding (and burning CPU) for a film nobody is watching any more.
    notifyPlaybackStopped(mediaTypeRef.current, mediaIdRef.current);
    stop();
    onClose();
  }, [onClose, stop]);

  const skipIntro = () => {
    if (introEnd) {
      handleSeek(introEnd);
      setShowSkipIntro(false);
    }
  };

  // ─── Audio track selection ─────────────────────────────────────────────────

  /**
   * Switch audio track by asking the server for a stream muxed with that
   * track, then resuming at the current position.
   *
   * This used to be attempted purely client-side: mute the <video> and lay a
   * second <audio> element carrying an ffmpeg-transcoded audio-only stream
   * over the top. It could not work. The two elements have independent
   * clocks, so they drift immediately and neither seeking nor pausing keeps
   * them together — and worse, once that path was taken it was never left
   * again: switching *back* to the original track hit the "already on the
   * separate-audio path" branch, so the video stayed muted forever and the
   * film played with no sound at all whichever track was chosen.
   *
   * Picking the track server-side is what Plex and Jellyfin do, and for the
   * same reason: an HLS stream carries the one audio track it was muxed
   * with, so the only honest way to change it is to produce a different
   * stream.
   */
  const selectAudioTrack = useCallback((idx: number) => {
    const video = videoRef.current;
    if (!video) return;
    if (selectedAudioRef.current === idx) {
      setShowAudioMenu(false);
      return;
    }

    setShowAudioMenu(false);
    setSelectedAudio(idx);
    selectedAudioRef.current = idx;

    // Resume where the switch interrupted, and let the transcode fallback
    // logic start fresh: a decode failure on the new stream deserves its
    // own retry rather than being suppressed by an earlier one.
    pendingSeekRef.current = video.currentTime;
    hasFallenBackToTranscodeRef.current = false;
    mediaRecoveryTriedRef.current = false;
    networkRecoveryTriedRef.current = false;

    hlsRef.current?.destroy();
    hlsRef.current = null;
    video.pause();

    loadStreamRef.current({ audioTrack: idx });
  }, []);

  // ─── Subtitle track selection ──────────────────────────────────────────────

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
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((vttText) => {
        const cues = parseVtt(vttText);
        if (cues.length === 0) {
          console.warn('[VideoPlayer] Subtitle fetch returned empty cues for track', track);
        }
        subtitleCuesRef.current = cues;
      })
      .catch((err) => {
        console.warn('[VideoPlayer] Subtitle fetch failed:', err);
      });
  };

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!videoRef.current) return;
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
          // In fullscreen the browser handles Escape itself, and stopping
          // as well meant one press both left fullscreen and ended the
          // film. Let it just leave fullscreen; a second press stops.
          if (!document.fullscreenElement) handleStop();
          break;
      }
      resetHideTimer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resetHideTimer, handleStop, togglePlay, skip, toggleMute, toggleFullscreen]);

  // ─── Track fullscreen state ────────────────────────────────────────────────
  // Fullscreen can also be left with Escape or the browser's own UI, which
  // never routes through toggleFullscreen() — so the button's icon has to
  // follow the document, not our own last action.

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // ─── Slow-load hint ────────────────────────────────────────────────────────
  // Only after a few seconds: a stream that starts promptly shouldn't flash
  // an explanation for a wait that never happened.

  const [showSlowLoadHint, setShowSlowLoadHint] = useState(false);
  useEffect(() => {
    if (!isLoading) {
      setShowSlowLoadHint(false);
      return;
    }
    const t = setTimeout(() => setShowSlowLoadHint(true), 4000);
    return () => clearTimeout(t);
  }, [isLoading]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const progressPercent = duration ? (seek / duration) * 100 : 0;
  const VolumeIcon = isMuted || volume === 0 ? VolumeX : Volume2;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black overflow-hidden"
      onMouseMove={resetHideTimer}
    >
      {/* Video */}
      {/*
        Fills the whole viewport. The control bar below is an out-of-flow
        overlay rather than a flex sibling on purpose: as a flex item it
        permanently reserved its own height, which stayed behind as a black
        strip once the bar slid away on auto-hide.
      */}
      <div className="absolute inset-0" onClick={togglePlay}>
        {/*
          Backdrop shown until the first frame arrives. Deliberately a
          background image on its own absolutely-positioned layer rather
          than the <video poster> attribute: that way it fills the frame
          (cover) instead of being letterboxed by the video's object-contain,
          and being out of flow it cannot influence layout at all.
        */}
        {isLoading && backdropUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${backdropUrl})` }}
          />
        )}

        {/*
          No `src` here on purpose — it's assigned imperatively once the
          info-fetch effect knows the right URL (direct play or HLS).
          Setting it here too used to race that effect's later video.src
          reassignment.
        */}
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-contain"
          playsInline
        />

        {/*
          Loading. Two variants share one spinner: the initial negotiation
          dims the backdrop behind it and explains itself (starting a
          transcode can take tens of seconds, and silence for that long
          reads as "it's broken"), while a mid-playback buffer runs the
          spinner alone over the frozen frame.
        */}
        {(isLoading || isBuffering) && !loadError && (
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none ${
              isLoading ? 'bg-black/50' : ''
            }`}
          >
            <div className="h-12 w-12 rounded-full border-4 border-white/20 border-t-red-600 animate-spin" />
            {isLoading && showSlowLoadHint && (
              <p className="text-sm text-white/70 max-w-md text-center px-6">
                Der Stream wird vorbereitet – das kann bei diesem Film einen Moment dauern.
              </p>
            )}
          </div>
        )}

        {/* Load failure — better than a spinner that never stops. */}
        {loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 px-6 text-center">
            <p className="text-white">{loadError}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                loadStreamRef.current();
              }}
              className="px-5 py-2 rounded-lg bg-white text-black font-medium hover:bg-white/90"
            >
              Erneut versuchen
            </button>
          </div>
        )}

        {/* Subtitle overlay */}
        {currentCueText && (
          <div
            className={`absolute left-0 right-0 flex justify-center pointer-events-none px-6 transition-all duration-300 ${showControls ? 'bottom-28' : 'bottom-12'}`}
          >
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
            onClick={(e) => {
              e.stopPropagation();
              skipIntro();
            }}
            className="absolute bottom-28 right-8 px-6 py-3 bg-white text-black font-semibold rounded hover:bg-white/90"
          >
            Intro überspringen
          </button>
        )}

        {/* Next Episode */}
        {showNextEpisode && nextEpisode && (
          <div
            className="absolute bottom-28 right-8 bg-black/90 rounded-lg p-4"
            onClick={(e) => e.stopPropagation()}
          >
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

        {/*
          Top Bar. stopPropagation is load-bearing: this sits inside the
          click-to-play surface, so without it every press of Minimieren or
          Vollbild also toggled playback — the film paused itself on the way
          into fullscreen.

          It's also removed from the layer entirely while hidden rather than
          just made transparent, so an invisible bar can't swallow clicks
          meant for the picture.
        */}
        <div
          className={`absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent transition-opacity ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={minimize}
            className="text-white/80 hover:text-white p-2"
            title="Minimieren"
          >
            <ChevronDown className="h-6 w-6" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="text-white/80 hover:text-white p-2"
            title={isFullscreen ? 'Vollbild beenden' : 'Vollbild'}
          >
            {isFullscreen ? <Minimize className="h-6 w-6" /> : <Maximize className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/*
        Control Bar — floats over the picture in the same glass style as the
        music PlayerBar, so the film stays visible behind it. Out of flow, so
        it leaves no gap when hidden; the slide-out distance is its own height
        plus the bottom margin, otherwise a sliver would stay on screen.
      */}
      <div
        className={`absolute bottom-4 left-4 right-4 transition-all duration-300 ${
          showControls
            ? 'translate-y-0 opacity-100'
            : 'translate-y-[calc(100%+1rem)] opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="liquid-glass rounded-2xl h-[72px] relative shadow-[0_8px_32px_0_rgba(0,0,0,0.8)]">
          {/*
            Progress Bar. The visible line is 4px, but the clickable element
            is 16px tall and pulled above the bar's top edge — a 4px target
            is close to unhittable with a mouse and impossible on a
            touchscreen, and missing it landed the click on the picture
            behind, which pauses the film.
          */}
          <div
            className="absolute -top-2 left-0 right-0 h-4 flex items-start cursor-pointer group"
            onClick={(e) => {
              if (!duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              handleSeek(Math.min(1, Math.max(0, percent)) * duration);
            }}
          >
            <div className="w-full mt-2 h-1 bg-white/20 rounded-t-2xl overflow-hidden transition-all group-hover:h-1.5">
              <div className="h-full bg-red-600" style={{ width: `${progressPercent}%` }} />
            </div>
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
                {isPlaying ? (
                  <Pause className="h-6 w-6 fill-current" />
                ) : (
                  <Play className="h-6 w-6 fill-current ml-0.5" />
                )}
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
                    <img
                      src={nextEpisode.thumbnail}
                      alt=""
                      className="w-full h-full object-cover"
                    />
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
                    onClick={() => {
                      setShowAudioMenu((v) => !v);
                      setShowSubtitleMenu(false);
                    }}
                    className={`flex items-center justify-center w-9 h-9 rounded hover:bg-white/10 transition-colors ${showAudioMenu ? 'text-white' : 'text-white/60'}`}
                    title="Audiospur"
                  >
                    <Languages className="h-4 w-4" />
                  </button>
                  {showAudioMenu && (
                    <div className="absolute bottom-full right-0 mb-2 liquid-glass rounded-xl min-w-[200px] py-1 z-10 shadow-[0_8px_32px_0_rgba(0,0,0,0.8)]">
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                        Audiospur
                      </p>
                      {audioTracks.map((t, i) => (
                        <button
                          key={t.index}
                          onClick={() => selectAudioTrack(i)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors ${selectedAudio === i ? 'text-white' : 'text-white/70'}`}
                        >
                          <span
                            className={`inline-block w-3 h-3 rounded-full border mr-2 align-middle ${selectedAudio === i ? 'bg-red-500 border-red-500' : 'border-white/30'}`}
                          />
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
                    onClick={() => {
                      setShowSubtitleMenu((v) => !v);
                      setShowAudioMenu(false);
                    }}
                    className={`flex items-center justify-center w-9 h-9 rounded hover:bg-white/10 transition-colors ${selectedSubtitle !== null ? 'text-white' : showSubtitleMenu ? 'text-white' : 'text-white/60'}`}
                    title="Untertitel"
                  >
                    <Captions className="h-4 w-4" />
                  </button>
                  {showSubtitleMenu && (
                    <div className="absolute bottom-full right-0 mb-2 liquid-glass rounded-xl min-w-[200px] py-1 z-10 shadow-[0_8px_32px_0_rgba(0,0,0,0.8)]">
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                        Untertitel
                      </p>
                      <button
                        onClick={() => selectSubtitleTrack(null)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors ${selectedSubtitle === null ? 'text-white' : 'text-white/70'}`}
                      >
                        <span
                          className={`inline-block w-3 h-3 rounded-full border mr-2 align-middle ${selectedSubtitle === null ? 'bg-red-500 border-red-500' : 'border-white/30'}`}
                        />
                        Aus
                      </button>
                      {subtitleTracks.map((s, i) => (
                        <button
                          key={s.index}
                          onClick={() => selectSubtitleTrack(i)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors ${selectedSubtitle === i ? 'text-white' : 'text-white/70'}`}
                        >
                          <span
                            className={`inline-block w-3 h-3 rounded-full border mr-2 align-middle ${selectedSubtitle === i ? 'bg-red-500 border-red-500' : 'border-white/30'}`}
                          />
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
                {/*
                  Same reasoning as the progress bar: the visible track is
                  4px but the <input> spans a 16px row, matching the music
                  PlayerBar's volume control.
                */}
                <div className="relative w-24 h-4 flex items-center">
                  <div className="absolute left-0 right-0 h-1 bg-white/30 rounded overflow-hidden pointer-events-none">
                    <div
                      className="h-full bg-red-600"
                      style={{ width: `${isMuted ? 0 : volume * 100}%` }}
                    />
                  </div>
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
    </div>
  );
}
