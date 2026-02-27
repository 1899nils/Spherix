import { logger } from '../../config/logger.js';
import { scrobbleQueue } from '../lastfm/scrobble.queue.js';

const POLL_INTERVAL_MS = 30_000; // Poll every 30 seconds
const MIN_SCROBBLE_SECONDS = 30; // Last.fm: scrobble if listened >= 30s

export interface ParsedTrack {
  artist: string;
  title: string;
}

/**
 * Fetches the current ICY stream title from a live radio URL.
 * Sends the Icy-MetaData header, reads just enough of the stream to
 * extract the StreamTitle metadata block, then closes the connection.
 * Returns null if the station does not support ICY metadata.
 */
async function fetchIcyTitle(streamUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(streamUrl, {
      headers: {
        'Icy-MetaData': '1',
        'User-Agent': 'Spherix/1.0',
        Connection: 'close',
      },
      signal: controller.signal,
    });

    const metaInt = parseInt(response.headers.get('icy-metaint') ?? '0', 10);
    if (!metaInt || !response.body) return null;

    const reader = response.body.getReader();
    let buffer = new Uint8Array(0);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || !value) break;

        const next = new Uint8Array(buffer.length + value.length);
        next.set(buffer);
        next.set(value, buffer.length);
        buffer = next;

        // Wait until we have the full audio block + metadata length byte
        if (buffer.length <= metaInt) continue;

        const metaLength = buffer[metaInt] * 16;
        if (metaLength === 0) return null;

        // Wait until we have the full metadata block
        if (buffer.length < metaInt + 1 + metaLength) continue;

        await reader.cancel();
        const raw = new TextDecoder()
          .decode(buffer.subarray(metaInt + 1, metaInt + 1 + metaLength))
          .replace(/\0/g, '');
        const match = raw.match(/StreamTitle='([^']*)'/);
        return match ? match[1].trim() : null;
      }
    } finally {
      reader.releaseLock();
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parses a StreamTitle string into artist and title.
 * Most stations use "Artist - Title" format.
 * Returns only a title if no separator is found.
 */
export function parseStreamTitle(raw: string): ParsedTrack {
  const sep = raw.indexOf(' - ');
  if (sep !== -1) {
    return { artist: raw.slice(0, sep).trim(), title: raw.slice(sep + 3).trim() };
  }
  return { artist: '', title: raw.trim() };
}

// ─── Poller ──────────────────────────────────────────────────────────────────

interface PollerState {
  userId: string;
  stationUrl: string;
  stationName: string;
  currentTitle: string | null;
  trackStartTime: number | null;
  timer: ReturnType<typeof setInterval> | null;
}

class RadioPollerManager {
  private readonly pollers = new Map<string, PollerState>();

  /**
   * Start polling ICY metadata for a user's radio station.
   * Automatically stops any existing poller for that user first.
   */
  async start(userId: string, stationUrl: string, stationName: string): Promise<void> {
    this.stop(userId);

    const state: PollerState = {
      userId,
      stationUrl,
      stationName,
      currentTitle: null,
      trackStartTime: null,
      timer: null,
    };
    this.pollers.set(userId, state);
    logger.info(`Radio metadata polling started: "${stationName}"`, { userId });

    // Poll immediately, then on the interval
    await this.poll(userId);
    state.timer = setInterval(() => void this.poll(userId), POLL_INTERVAL_MS);
  }

  /**
   * Stop polling for a user. Scrobbles the current track if it was
   * played long enough to qualify.
   */
  stop(userId: string): void {
    const state = this.pollers.get(userId);
    if (!state) return;

    if (state.timer) clearInterval(state.timer);
    this.scrobbleCurrent(state);
    this.pollers.delete(userId);
    logger.info(`Radio metadata polling stopped`, { userId });
  }

  private async poll(userId: string): Promise<void> {
    const state = this.pollers.get(userId);
    if (!state) return;

    try {
      const rawTitle = await fetchIcyTitle(state.stationUrl);
      if (!rawTitle) return; // Station doesn't support ICY or timed out
      if (rawTitle === state.currentTitle) return; // Same track still playing

      // Track changed — scrobble the previous one, start the new one
      this.scrobbleCurrent(state);

      const { artist, title } = parseStreamTitle(rawTitle);
      state.currentTitle = rawTitle;
      state.trackStartTime = Date.now();
      logger.info(`Radio track detected: "${rawTitle}"`, { userId });

      // Update Last.fm Now Playing
      await scrobbleQueue.add('now-playing', {
        userId,
        track: {
          artist: artist || state.stationName,
          track: title,
          album: state.stationName,
        },
      });
    } catch (err) {
      logger.warn(`Radio metadata poll error`, { userId, error: String(err) });
    }
  }

  private scrobbleCurrent(state: PollerState): void {
    if (!state.currentTitle || !state.trackStartTime) return;

    const playedSeconds = (Date.now() - state.trackStartTime) / 1000;
    if (playedSeconds < MIN_SCROBBLE_SECONDS) {
      state.currentTitle = null;
      state.trackStartTime = null;
      return;
    }

    const { artist, title } = parseStreamTitle(state.currentTitle);
    const timestamp = Math.floor(state.trackStartTime / 1000);

    void scrobbleQueue.add('scrobble', {
      userId: state.userId,
      track: {
        artist: artist || state.stationName,
        track: title,
        album: state.stationName,
      },
      timestamp,
    });

    logger.info(
      `Radio scrobble queued: "${state.currentTitle}" (played ${Math.round(playedSeconds)}s)`,
      { userId: state.userId },
    );

    state.currentTitle = null;
    state.trackStartTime = null;
  }
}

export const radioPoller = new RadioPollerManager();
