import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import { promisify } from 'node:util';
import type { Request } from 'express';
import { logger } from '../../config/logger.js';

const execFileAsync = promisify(execFile);

export interface MediaInfo {
  container: string;
  duration: number; // seconds
  size: number; // bytes
  video: {
    codec: string;
    codecLongName: string;
    width: number;
    height: number;
    fps: number;
    bitrate: number;
    pixFmt: string;
    profile?: string;
    level?: string;
  } | null;
  audio: {
    index: number;
    codec: string;
    codecLongName: string;
    language?: string;
    channels: number;
    sampleRate: number;
    bitrate: number;
    default: boolean;
  }[];
  subtitles: {
    index: number;
    codec: string;
    language?: string;
    title?: string;
    default: boolean;
    forced: boolean;
  }[];
}

export interface ClientCapabilities {
  /**
   * Codecs decodable via Media Source Extensions — what the HLS path can
   * actually deliver, and therefore what the remux/transcode decision uses.
   */
  videoCodecs: string[]; // 'h264', 'hevc', 'vp9', 'av1'
  audioCodecs: string[]; // 'aac', 'ac3', 'eac3', 'opus'
  /**
   * Codecs decodable by a plain `<video src>`, used for direct play. This
   * is a different (usually larger) set than the MSE one — Firefox decodes
   * HEVC natively but not through MSE — so a file the browser could play
   * untouched isn't transcoded merely because MSE couldn't have handled it.
   * Falls back to the MSE lists when a client doesn't report them.
   */
  nativeVideoCodecs?: string[];
  nativeAudioCodecs?: string[];
  maxResolution: { width: number; height: number };
  maxBitrate: number;
  containerFormats: string[]; // 'mp4', 'webm', 'mkv'
}

/**
 * Parse an ffprobe frame-rate fraction string (e.g. "24000/1001" or "25/1")
 * into a decimal number, without resorting to eval().
 */
function parseFrameRate(value: string | undefined | null): number {
  if (!value) return 0;
  const [numerator, denominator] = value.split('/');
  const num = Number(numerator);
  const den = denominator !== undefined ? Number(denominator) : 1;
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
  return num / den;
}

/**
 * Cache of ffprobe results, keyed by path + size + mtime so an edited or
 * replaced file is never served from a stale entry.
 *
 * Starting one film runs ffprobe several times over the same file: once for
 * /stream/info, again for the playlist route, and again for each of hls.js's
 * manifest retries. ffprobe has to read and parse the container to answer,
 * which on a NAS with the media on spinning disks is seconds rather than
 * milliseconds — paid repeatedly, before a single frame has been produced.
 */
const probeCache = new Map<string, MediaInfo>();
/** Bounded so a large library can't turn the cache into a memory leak. */
const PROBE_CACHE_MAX = 200;

/**
 * Probe media file with ffprobe to get codec information
 */
export async function probeMedia(filePath: string): Promise<MediaInfo | null> {
  let cacheKey: string | null = null;
  try {
    const st = statSync(filePath);
    cacheKey = `${filePath}:${st.size}:${st.mtimeMs}`;
    const cached = probeCache.get(cacheKey);
    if (cached) return cached;
  } catch {
    // Unreadable file — let the probe below produce the real error.
  }

  try {
    // Use execFile (not exec) with an argument array so the file path is never
    // interpreted by a shell — a filename containing shell metacharacters
    // (backticks, `;`, `$()`, ...) must not be able to run arbitrary commands.
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { maxBuffer: 10 * 1024 * 1024 },
    );

    const data = JSON.parse(stdout);
    const format = data.format;
    const streams = data.streams || [];

    const videoStream = streams.find((s: any) => s.codec_type === 'video');
    const audioStreams = streams.filter((s: any) => s.codec_type === 'audio');
    const subtitleStreams = streams.filter((s: any) => s.codec_type === 'subtitle');

    const info: MediaInfo = {
      container: format.format_name?.split(',')[0] || 'unknown',
      duration: parseFloat(format.duration) || 0,
      size: parseInt(format.size) || 0,
      video: videoStream
        ? {
            codec: videoStream.codec_name,
            codecLongName: videoStream.codec_long_name,
            width: videoStream.width,
            height: videoStream.height,
            fps: parseFrameRate(videoStream.r_frame_rate), // "24000/1001" -> 23.976
            bitrate: parseInt(videoStream.bit_rate) || 0,
            pixFmt: videoStream.pix_fmt,
            profile: videoStream.profile,
            level: videoStream.level?.toString(),
          }
        : null,
      audio: audioStreams.map((s: any, _index: number) => ({
        index: s.index,
        codec: s.codec_name,
        codecLongName: s.codec_long_name,
        language: s.tags?.language,
        channels: s.channels,
        sampleRate: parseInt(s.sample_rate),
        bitrate: parseInt(s.bit_rate) || 0,
        default: s.disposition?.default === 1,
      })),
      subtitles: subtitleStreams.map((s: any) => ({
        index: s.index,
        codec: s.codec_name,
        language: s.tags?.language,
        title: s.tags?.title,
        default: s.disposition?.default === 1,
        forced: s.disposition?.forced === 1,
      })),
    };

    if (cacheKey) {
      // Plain FIFO eviction — entries are interchangeable and tiny, so a
      // proper LRU would buy nothing here.
      if (probeCache.size >= PROBE_CACHE_MAX) {
        const oldest = probeCache.keys().next().value;
        if (oldest !== undefined) probeCache.delete(oldest);
      }
      probeCache.set(cacheKey, info);
    }

    return info;
  } catch (error) {
    logger.error(`Failed to probe media: ${filePath}`, { error });
    return null;
  }
}

/**
 * Check if client can play media directly without transcoding
 */
/**
 * Resolve a requested audio track to a real index into `mediaInfo.audio`.
 *
 * Anything out of range (or nothing requested) falls back to the file's
 * default track, or the first one if none is flagged default — the same
 * track a player would pick on its own. Returns -1 for a file with no audio.
 */
export function resolveAudioTrack(mediaInfo: MediaInfo, requested?: number): number {
  if (mediaInfo.audio.length === 0) return -1;
  if (requested != null && requested >= 0 && requested < mediaInfo.audio.length) {
    return requested;
  }
  const defaultIdx = mediaInfo.audio.findIndex((a) => a.default);
  return defaultIdx >= 0 ? defaultIdx : 0;
}

export function canDirectPlay(
  mediaInfo: MediaInfo,
  clientCaps: ClientCapabilities,
  audioTrack?: number,
): { playable: boolean; reason?: string } {
  if (!mediaInfo.video) {
    return { playable: false, reason: 'No video stream' };
  }

  // Direct play hands the whole file to the <video> element, which plays the
  // container's default audio track and gives no dependable way to switch.
  // So a request for any other track can only be served by the transcode
  // path, where the track is chosen when the stream is muxed.
  const defaultTrack = resolveAudioTrack(mediaInfo);
  if (audioTrack != null && audioTrack >= 0 && audioTrack !== defaultTrack) {
    return { playable: false, reason: 'A non-default audio track was requested' };
  }

  // Direct play hands the file to the <video> element, with no MSE in the
  // picture — so it's the browser's *native* decoding ability that decides,
  // not what hls.js could have fed it.
  const nativeVideo = clientCaps.nativeVideoCodecs ?? clientCaps.videoCodecs;
  const nativeAudio = clientCaps.nativeAudioCodecs ?? clientCaps.audioCodecs;

  // Check video codec
  const normalizedVideoCodec = normalizeVideoCodec(mediaInfo.video.codec);
  if (!nativeVideo.includes(normalizedVideoCodec)) {
    return {
      playable: false,
      reason: `Video codec ${mediaInfo.video.codec} not supported`,
    };
  }

  // Check resolution
  if (
    mediaInfo.video.width > clientCaps.maxResolution.width ||
    mediaInfo.video.height > clientCaps.maxResolution.height
  ) {
    return {
      playable: false,
      reason: `Resolution ${mediaInfo.video.width}x${mediaInfo.video.height} exceeds client capabilities`,
    };
  }

  // Check the audio track that will actually be played.
  //
  // This used to pass as long as *any* track in the file was compatible,
  // which is not the same question: the browser plays the default track, so
  // an MKV with a default AC3 track and a secondary AAC one was declared
  // directly playable and then played with no sound at all.
  if (defaultTrack >= 0) {
    const playedCodec = normalizeAudioCodec(mediaInfo.audio[defaultTrack].codec);
    if (!nativeAudio.includes(playedCodec)) {
      return {
        playable: false,
        reason: `Audio codec ${mediaInfo.audio[defaultTrack].codec} not supported`,
      };
    }
  }

  // Check container
  const container = mediaInfo.container.toLowerCase();
  if (!clientCaps.containerFormats.includes(container)) {
    return {
      playable: false,
      reason: `Container format ${container} not supported`,
    };
  }

  return { playable: true };
}

/**
 * Determine optimal transcode settings
 */
export function getTranscodeSettings(
  mediaInfo: MediaInfo,
  clientCaps: ClientCapabilities,
): {
  videoCodec: 'h264' | 'hevc';
  audioCodec: 'aac' | 'opus';
  maxResolution: { width: number; height: number };
  videoBitrate: number;
  audioBitrate: number;
} {
  // Always re-encode to H.264. This only applies when we've already decided
  // the source video has to be re-encoded at all — and at that point the
  // goal is "produce watchable output as fast as possible", which means
  // libx264. Picking HEVC here just because the client can *decode* HEVC
  // meant encoding with libx265, which is dramatically slower than libx264
  // at equivalent presets: a live repro had such a job still running long
  // after a later-started stream-copy job for a different movie had
  // finished entirely, so the first segment never arrived in time and
  // playback never started. H.264 is also universally supported, so this
  // never costs compatibility.
  const videoCodec = 'h264';

  // Use Opus for webm, AAC for mp4
  const audioCodec = 'aac';

  // Cap resolution to client max
  const sourceWidth = mediaInfo.video?.width || 1920;
  const sourceHeight = mediaInfo.video?.height || 1080;

  let targetWidth = Math.min(sourceWidth, clientCaps.maxResolution.width);
  let targetHeight = Math.min(sourceHeight, clientCaps.maxResolution.height);

  // Maintain aspect ratio
  if (targetWidth / targetHeight !== sourceWidth / sourceHeight) {
    const aspectRatio = sourceWidth / sourceHeight;
    if (targetWidth / aspectRatio <= targetHeight) {
      targetHeight = Math.round(targetWidth / aspectRatio);
    } else {
      targetWidth = Math.round(targetHeight * aspectRatio);
    }
    // Ensure even dimensions
    targetWidth = Math.floor(targetWidth / 2) * 2;
    targetHeight = Math.floor(targetHeight / 2) * 2;
  }

  // Calculate video bitrate based on resolution
  const videoBitrate = getRecommendedBitrate(targetWidth, targetHeight);
  const audioBitrate = 128000; // 128kbps for stereo AAC

  return {
    videoCodec,
    audioCodec,
    maxResolution: { width: targetWidth, height: targetHeight },
    videoBitrate,
    audioBitrate,
  };
}

export function normalizeVideoCodec(codec: string): string {
  const map: Record<string, string> = {
    h264: 'h264',
    libx264: 'h264',
    hevc: 'hevc',
    h265: 'hevc',
    libx265: 'hevc',
    vp9: 'vp9',
    'libvpx-vp9': 'vp9',
    av1: 'av1',
    'libaom-av1': 'av1',
    avc: 'h264',
  };
  return map[codec.toLowerCase()] || codec.toLowerCase();
}

export function normalizeAudioCodec(codec: string): string {
  const map: Record<string, string> = {
    aac: 'aac',
    libfdk_aac: 'aac',
    ac3: 'ac3',
    eac3: 'eac3',
    opus: 'opus',
    libopus: 'opus',
    mp3: 'mp3',
    flac: 'flac',
    dts: 'dts',
    truehd: 'truehd',
  };
  return map[codec.toLowerCase()] || codec.toLowerCase();
}

function getRecommendedBitrate(width: number, height: number): number {
  const pixels = width * height;
  if (pixels >= 3840 * 2160) return 16000000; // 4K: 16Mbps
  if (pixels >= 1920 * 1080) return 8000000; // 1080p: 8Mbps
  if (pixels >= 1280 * 720) return 4000000; // 720p: 4Mbps
  if (pixels >= 854 * 480) return 2000000; // 480p: 2Mbps
  return 1000000; // SD: 1Mbps
}

/**
 * Default client capabilities (modern browsers)
 */
export function getDefaultClientCapabilities(): ClientCapabilities {
  return {
    videoCodecs: ['h264', 'hevc', 'vp9', 'av1'],
    // DTS and TrueHD are NOT included — browsers cannot decode them natively.
    // Omitting them causes the server to correctly return an HLS transcode URL
    // instead of a direct-play URL for files with those audio codecs.
    audioCodecs: ['aac', 'opus', 'mp3', 'ac3', 'eac3', 'flac'],
    maxResolution: { width: 3840, height: 2160 },
    maxBitrate: 40000000,
    // Chrome can play MKV/AVI/MOV containers natively
    containerFormats: ['mp4', 'webm', 'mkv', 'matroska', 'mov', 'avi', 'm4v'],
  };
}

/**
 * Parse client capabilities from request headers or query params.
 *
 * Both sources are supported because not every request that needs this can
 * set a custom header: the initial `/stream/info` call from the player can
 * (and does), but once that call decides an HLS transcode is needed, hls.js
 * issues its own request for the playlist and doesn't forward custom
 * headers — so that follow-up request re-derives capabilities from
 * scratch unless we hand them along some other way. The player embeds the
 * same JSON as a `caps` query param in the returned HLS playlist URL for
 * exactly this reason; without it, the second request would silently fall
 * back to the (Chrome-oriented) defaults and could redirect back to direct
 * play on a container/codec the requesting browser can't actually decode.
 */
export function parseClientCapabilities(req: Request): ClientCapabilities {
  const defaults = getDefaultClientCapabilities();

  const capsHeaderRaw = req.headers['x-client-capabilities'];
  const capsHeader = Array.isArray(capsHeaderRaw) ? capsHeaderRaw[0] : capsHeaderRaw;
  const capsQueryRaw = req.query?.caps;
  const capsQuery = typeof capsQueryRaw === 'string' ? capsQueryRaw : undefined;

  const raw = capsHeader ?? capsQuery;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return {
        ...defaults,
        ...parsed,
      };
    } catch {
      // Ignore parse error, use defaults
    }
  }

  return defaults;
}
