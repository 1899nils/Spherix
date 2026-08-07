import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `getTranscodeDirectory()` derives its path from `env.dataDir`, which is
// read once from DATA_DIR when config/env.js first loads. Point it at an
// isolated temp directory before importing the service under test so this
// test never touches the real /data/transcodes folder.
let dataDir: string;
let cleanupOldTranscodes: (typeof import('./transcode.service.js'))['cleanupOldTranscodes'];
let getTranscodeDirectory: (typeof import('./transcode.service.js'))['getTranscodeDirectory'];
let planTranscode: (typeof import('./transcode.service.js'))['planTranscode'];

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'spherix-transcode-test-'));
  process.env.DATA_DIR = dataDir;
  ({ cleanupOldTranscodes, getTranscodeDirectory, planTranscode } =
    await import('./transcode.service.js'));
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('cleanupOldTranscodes', () => {
  it('deletes stale transcode output directories from disk', async () => {
    const dir = getTranscodeDirectory();
    const oldTimestamp = Date.now() - 48 * 60 * 60 * 1000; // 48h ago
    const staleJobDir = join(dir, `transcode_movie1_${oldTimestamp}`);
    mkdirSync(staleJobDir, { recursive: true });

    await cleanupOldTranscodes(24);

    expect(existsSync(staleJobDir)).toBe(false);
  });

  it('keeps transcode directories younger than maxAgeHours', async () => {
    const dir = getTranscodeDirectory();
    const recentJobDir = join(dir, `transcode_movie2_${Date.now()}`);
    mkdirSync(recentJobDir, { recursive: true });

    await cleanupOldTranscodes(24);

    expect(existsSync(recentJobDir)).toBe(true);
  });

  it('never touches directories that are not transcode output', async () => {
    const dir = getTranscodeDirectory();
    const unrelated = join(dir, 'not-a-transcode-dir');
    mkdirSync(unrelated, { recursive: true });

    await cleanupOldTranscodes(24);

    expect(existsSync(unrelated)).toBe(true);
  });
});

// ─── planTranscode ────────────────────────────────────────────────────────────

type MediaInfo = Parameters<(typeof import('./transcode.service.js'))['planTranscode']>[0];
type ClientCaps = Parameters<(typeof import('./transcode.service.js'))['planTranscode']>[1];

function media(videoCodec: string | null, audioCodec: string): MediaInfo {
  return {
    container: 'matroska',
    duration: 3600,
    size: 1000,
    video: videoCodec
      ? {
          codec: videoCodec,
          codecLongName: videoCodec,
          width: 1920,
          height: 1080,
          fps: 24,
          bitrate: 5_000_000,
          pixFmt: 'yuv420p',
        }
      : null,
    audio: [
      {
        index: 1,
        codec: audioCodec,
        codecLongName: audioCodec,
        channels: 2,
        sampleRate: 48000,
        bitrate: 128000,
        default: true,
      },
    ],
    subtitles: [],
  };
}

function caps(videoCodecs: string[], audioCodecs: string[]): ClientCaps {
  return {
    videoCodecs,
    audioCodecs,
    maxResolution: { width: 3840, height: 2160 },
    maxBitrate: 40_000_000,
    containerFormats: ['mp4'],
  };
}

describe('planTranscode', () => {
  it('copies both streams when the client supports them (the cheap remux case)', () => {
    const plan = planTranscode(media('h264', 'aac'), caps(['h264'], ['aac']));
    expect(plan).toEqual({ copyVideo: true, copyAudio: true, segmentType: 'ts' });
  });

  it('re-encodes only the audio when just the audio codec is unsupported', () => {
    const plan = planTranscode(media('h264', 'dts'), caps(['h264'], ['aac']));
    expect(plan.copyVideo).toBe(true);
    expect(plan.copyAudio).toBe(false);
  });

  it('re-encodes the video when the client cannot decode it', () => {
    const plan = planTranscode(media('hevc', 'aac'), caps(['h264'], ['aac']));
    expect(plan.copyVideo).toBe(false);
  });

  it('uses fMP4 segments when copying HEVC, since hls.js cannot play HEVC in MPEG-TS', () => {
    const plan = planTranscode(media('hevc', 'aac'), caps(['h264', 'hevc'], ['aac']));
    expect(plan.copyVideo).toBe(true);
    expect(plan.segmentType).toBe('fmp4');
  });

  it('does not copy FLAC audio into MPEG-TS, which cannot carry it', () => {
    const plan = planTranscode(media('h264', 'flac'), caps(['h264'], ['flac']));
    expect(plan.segmentType).toBe('ts');
    expect(plan.copyAudio).toBe(false);
  });

  it('does copy FLAC audio when the segments are fMP4', () => {
    const plan = planTranscode(media('hevc', 'flac'), caps(['hevc'], ['flac']));
    expect(plan.segmentType).toBe('fmp4');
    expect(plan.copyAudio).toBe(true);
  });
});

describe('canDirectPlay', () => {
  it('uses the native codec list, not the MSE one', async () => {
    // Regression guard for the Firefox HEVC case: HEVC is deliberately kept
    // out of the MSE list (Firefox accepts it there and then never decodes
    // a frame), but Firefox *can* decode HEVC natively. Direct play doesn't
    // involve MSE at all, so an HEVC file in a container the browser can
    // demux must still direct play rather than being pointlessly
    // transcoded.
    const { canDirectPlay } = await import('./mediaInfo.service.js');
    const firefoxLike = {
      ...caps([/* MSE: no hevc */ 'h264'], ['aac']),
      nativeVideoCodecs: ['h264', 'hevc'],
      nativeAudioCodecs: ['aac'],
      containerFormats: ['mp4'],
    };
    const result = canDirectPlay({ ...media('hevc', 'aac'), container: 'mp4' }, firefoxLike);
    expect(result.playable).toBe(true);
  });

  it('still refuses direct play when even native decoding cannot handle it', async () => {
    const { canDirectPlay } = await import('./mediaInfo.service.js');
    const noHevc = {
      ...caps(['h264'], ['aac']),
      nativeVideoCodecs: ['h264'],
      nativeAudioCodecs: ['aac'],
    };
    const result = canDirectPlay({ ...media('hevc', 'aac'), container: 'mp4' }, noHevc);
    expect(result.playable).toBe(false);
  });

  it('falls back to the MSE lists for clients that report no native ones', async () => {
    const { canDirectPlay } = await import('./mediaInfo.service.js');
    const result = canDirectPlay(
      { ...media('h264', 'aac'), container: 'mp4' },
      caps(['h264'], ['aac']),
    );
    expect(result.playable).toBe(true);
  });

  it('judges audio by the default track, not by whether any track is compatible', async () => {
    // Regression guard: this used to pass as long as *some* track in the
    // file was playable. The browser plays the default one, so a file whose
    // default is AC3 direct-played to complete silence even though a
    // secondary AAC track existed.
    const { canDirectPlay } = await import('./mediaInfo.service.js');
    const result = canDirectPlay(
      { ...multiAudio('ac3', 'aac'), container: 'mp4' },
      caps(['h264'], ['aac']),
    );
    expect(result.playable).toBe(false);
  });

  it('refuses direct play for a non-default audio track, which it cannot select', async () => {
    const { canDirectPlay } = await import('./mediaInfo.service.js');
    const result = canDirectPlay(
      { ...multiAudio('aac', 'aac'), container: 'mp4' },
      caps(['h264'], ['aac']),
      1,
    );
    expect(result.playable).toBe(false);
  });

  it('allows direct play when the requested track is the default one anyway', async () => {
    const { canDirectPlay } = await import('./mediaInfo.service.js');
    const result = canDirectPlay(
      { ...multiAudio('aac', 'ac3'), container: 'mp4' },
      caps(['h264'], ['aac']),
      0,
    );
    expect(result.playable).toBe(true);
  });
});

// ─── Audio track selection ────────────────────────────────────────────────────

/** A file with two audio tracks; the first is the default. */
function multiAudio(firstCodec: string, secondCodec: string): MediaInfo {
  const base = media('h264', firstCodec);
  return {
    ...base,
    audio: [
      base.audio[0],
      {
        ...base.audio[0],
        index: 2,
        codec: secondCodec,
        codecLongName: secondCodec,
        default: false,
      },
    ],
  };
}

describe('resolveAudioTrack', () => {
  it('picks the default track when none is requested', async () => {
    const { resolveAudioTrack } = await import('./mediaInfo.service.js');
    const info = multiAudio('ac3', 'aac');
    info.audio[0].default = false;
    info.audio[1].default = true;
    expect(resolveAudioTrack(info)).toBe(1);
  });

  it('falls back to the first track when nothing is flagged default', async () => {
    const { resolveAudioTrack } = await import('./mediaInfo.service.js');
    const info = multiAudio('ac3', 'aac');
    info.audio[0].default = false;
    expect(resolveAudioTrack(info)).toBe(0);
  });

  it('honours a requested track', async () => {
    const { resolveAudioTrack } = await import('./mediaInfo.service.js');
    expect(resolveAudioTrack(multiAudio('aac', 'ac3'), 1)).toBe(1);
  });

  it('ignores an out-of-range request rather than producing a broken mapping', async () => {
    const { resolveAudioTrack } = await import('./mediaInfo.service.js');
    expect(resolveAudioTrack(multiAudio('aac', 'ac3'), 7)).toBe(0);
  });

  it('reports no track for a file without audio', async () => {
    const { resolveAudioTrack } = await import('./mediaInfo.service.js');
    expect(resolveAudioTrack({ ...media('h264', 'aac'), audio: [] })).toBe(-1);
  });
});

describe('planTranscode with an explicit audio track', () => {
  it('plans for the selected track, not the default one', () => {
    // The default is AAC (copyable), the selected one is DTS (not). Getting
    // this wrong would tell ffmpeg to copy a stream it has to re-encode.
    const plan = planTranscode(multiAudio('aac', 'dts'), caps(['h264'], ['aac']), 1);
    expect(plan.copyVideo).toBe(true);
    expect(plan.copyAudio).toBe(false);
  });

  it('copies the selected track when it is the compatible one', () => {
    const plan = planTranscode(multiAudio('dts', 'aac'), caps(['h264'], ['aac']), 1);
    expect(plan.copyAudio).toBe(true);
  });
});

describe('getTranscodeSettings', () => {
  it('always re-encodes to H.264, even for a client that can decode HEVC', async () => {
    // Regression guard: this used to pick HEVC (and therefore libx265)
    // whenever the *client* could decode HEVC, which made re-encodes so slow
    // that the first HLS segment never arrived and playback never started.
    // The encoder target is about how fast we can produce output, not about
    // what the client could theoretically play.
    const { getTranscodeSettings } = await import('./mediaInfo.service.js');
    const settings = getTranscodeSettings(media('hevc', 'aac'), caps(['h264', 'hevc'], ['aac']));
    expect(settings.videoCodec).toBe('h264');
  });
});
