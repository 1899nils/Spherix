import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { logger } from '../../config/logger.js';

const execAsync = promisify(exec);

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
  videoCodecs: string[]; // 'h264', 'hevc', 'vp9', 'av1'
  audioCodecs: string[]; // 'aac', 'ac3', 'eac3', 'opus'
  maxResolution: { width: number; height: number };
  maxBitrate: number;
  containerFormats: string[]; // 'mp4', 'webm', 'mkv'
}

/**
 * Probe media file with ffprobe to get codec information
 */
export async function probeMedia(filePath: string): Promise<MediaInfo | null> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
    );

    const data = JSON.parse(stdout);
    const format = data.format;
    const streams = data.streams || [];

    const videoStream = streams.find((s: any) => s.codec_type === 'video');
    const audioStreams = streams.filter((s: any) => s.codec_type === 'audio');
    const subtitleStreams = streams.filter((s: any) => s.codec_type === 'subtitle');

    return {
      container: format.format_name?.split(',')[0] || 'unknown',
      duration: parseFloat(format.duration) || 0,
      size: parseInt(format.size) || 0,
      video: videoStream
        ? {
            codec: videoStream.codec_name,
            codecLongName: videoStream.codec_long_name,
            width: videoStream.width,
            height: videoStream.height,
            fps: eval(videoStream.r_frame_rate) || 0, // "24000/1001" -> 23.976
            bitrate: parseInt(videoStream.bit_rate) || 0,
            pixFmt: videoStream.pix_fmt,
            profile: videoStream.profile,
            level: videoStream.level?.toString(),
          }
        : null,
      audio: audioStreams.map((s: any, index: number) => ({
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
  } catch (error) {
    logger.error(`Failed to probe media: ${filePath}`, { error });
    return null;
  }
}

/**
 * Check if client can play media directly without transcoding
 */
export function canDirectPlay(
  mediaInfo: MediaInfo,
  clientCaps: ClientCapabilities
): { playable: boolean; reason?: string } {
  if (!mediaInfo.video) {
    return { playable: false, reason: 'No video stream' };
  }

  // Check video codec
  const normalizedVideoCodec = normalizeVideoCodec(mediaInfo.video.codec);
  if (!clientCaps.videoCodecs.includes(normalizedVideoCodec)) {
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

  // Check audio (at least one stream must be compatible)
  const hasCompatibleAudio = mediaInfo.audio.some((a) => {
    const normalizedAudioCodec = normalizeAudioCodec(a.codec);
    return clientCaps.audioCodecs.includes(normalizedAudioCodec);
  });

  if (!hasCompatibleAudio && mediaInfo.audio.length > 0) {
    return {
      playable: false,
      reason: `No compatible audio codec found`,
    };
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
  clientCaps: ClientCapabilities
): {
  videoCodec: 'h264' | 'hevc';
  audioCodec: 'aac' | 'opus';
  maxResolution: { width: number; height: number };
  videoBitrate: number;
  audioBitrate: number;
} {
  // Use HEVC if client supports it, otherwise H.264
  const videoCodec = clientCaps.videoCodecs.includes('hevc') ? 'hevc' : 'h264';

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

function normalizeVideoCodec(codec: string): string {
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

function normalizeAudioCodec(codec: string): string {
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
    videoCodecs: ['h264', 'vp9'],
    audioCodecs: ['aac', 'opus', 'mp3'],
    maxResolution: { width: 1920, height: 1080 },
    maxBitrate: 8000000,
    containerFormats: ['mp4', 'webm'],
  };
}

/**
 * Parse client capabilities from request headers or query params
 */
export function parseClientCapabilities(req: any): ClientCapabilities {
  const defaults = getDefaultClientCapabilities();

  // Check for custom header
  const capsHeader = req.headers['x-client-capabilities'];
  if (capsHeader) {
    try {
      const parsed = JSON.parse(capsHeader);
      return {
        ...defaults,
        ...parsed,
      };
    } catch {
      // Ignore parse error, use defaults
    }
  }

  // Detect from user agent
  const ua = req.headers['user-agent'] || '';

  // Safari supports HEVC
  if (ua.includes('Safari') && !ua.includes('Chrome')) {
    defaults.videoCodecs.push('hevc');
  }

  // 4K support detection (simplified)
  if (ua.includes('Chrome') || ua.includes('Safari') || ua.includes('Firefox')) {
    defaults.maxResolution = { width: 3840, height: 2160 };
    defaults.maxBitrate = 20000000;
  }

  return defaults;
}
