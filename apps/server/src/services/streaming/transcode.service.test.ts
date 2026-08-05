import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `getTranscodeDirectory()` derives its path from `env.dataDir`, which is
// read once from DATA_DIR when config/env.js first loads. Point it at an
// isolated temp directory before importing the service under test so this
// test never touches the real /data/transcodes folder.
let dataDir: string;
let cleanupOldTranscodes: typeof import('./transcode.service.js')['cleanupOldTranscodes'];
let getTranscodeDirectory: typeof import('./transcode.service.js')['getTranscodeDirectory'];

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'spherix-transcode-test-'));
  process.env.DATA_DIR = dataDir;
  ({ cleanupOldTranscodes, getTranscodeDirectory } = await import('./transcode.service.js'));
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
