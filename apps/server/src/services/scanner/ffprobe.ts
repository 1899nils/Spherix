/**
 * ffprobe wrapper — extracts codec, resolution, and duration from video files.
 * Requires ffmpeg (which ships ffprobe) to be installed in the runtime container.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { logger } from '../../config/logger.js';

const execFileAsync = promisify(execFile);

export interface ProbeResult {
  /** Video codec identifier, e.g. "h264", "hevc", "av1" */
  codec:      string | null;
  /** WIDTHxHEIGHT string, e.g. "1920x1080" */
  resolution: string | null;
  /** Duration in whole minutes (rounded) */
  runtime:    number | null;
  /** File size in bytes */
  fileSize:   bigint;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?:      number;
  height?:     number;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?:  { duration?: string; size?: string };
}

/**
 * Run ffprobe on a file and return its key metadata.
 * Falls back to stat-only values when ffprobe is unavailable or the file
 * can't be probed (e.g. MKV without standard header).
 */
export async function probeVideo(filePath: string): Promise<ProbeResult> {
  const fileSize = BigInt(fs.statSync(filePath).size);

  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',            'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        filePath,
      ],
      { maxBuffer: 2 * 1024 * 1024 },
    );

    const data = JSON.parse(stdout) as FfprobeOutput;

    const videoStream = data.streams?.find(s => s.codec_type === 'video');
    const durationSec = parseFloat(data.format?.duration ?? '0');

    return {
      codec:      videoStream?.codec_name ?? null,
      resolution: (videoStream?.width && videoStream?.height)
                    ? `${videoStream.width}x${videoStream.height}`
                    : null,
      runtime:    durationSec > 0 ? Math.round(durationSec / 60) : null,
      fileSize,
    };
  } catch (err) {
    logger.debug(`[ffprobe] Probe failed for ${filePath}: ${String(err)}`);
    return { codec: null, resolution: null, runtime: null, fileSize };
  }
}
