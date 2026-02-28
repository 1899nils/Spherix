import { logger } from '../../config/logger.js';
import { scrobbleQueue } from '../lastfm/scrobble.queue.js';
import { lastfmService } from '../lastfm/lastfm.service.js';
import { prisma } from '../../config/database.js';

const POLL_INTERVAL_MS = 30_000; // Poll every 30 seconds
/** Fallback minimum listen time when track duration is unknown */
const MIN_SCROBBLE_SECONDS = 30;
/** Scrobble only after listening to this fraction of the track */
const MIN_SCROBBLE_RATIO = 0.8;

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
 * Tries to extract artist/title from "Title von Artist" or "Title by Artist" patterns.
 */
function parseVonBy(text: string): ParsedTrack {
  const vonIdx = text.indexOf(' von ');
  if (vonIdx !== -1) {
    return { artist: text.slice(vonIdx + 5).trim(), title: text.slice(0, vonIdx).trim() };
  }
  const byIdx = text.indexOf(' by ');
  if (byIdx !== -1) {
    return { artist: text.slice(byIdx + 4).trim(), title: text.slice(0, byIdx).trim() };
  }
  return { artist: '', title: text.trim() };
}

/**
 * Parses a StreamTitle string into artist and title.
 * Handles common radio formats:
 *   "Artist - Title"
 *   "StationName - Title von Artist"  (German stations prefix their name)
 *   "Title von Artist" / "Title by Artist"
 *
 * @param raw        Raw ICY StreamTitle value
 * @param stationName  Name of the station, used to strip a leading "StationName - " prefix
 */
export function parseStreamTitle(raw: string, stationName?: string): ParsedTrack {
  let text = raw.trim();

  // Strip a leading "StationName - " prefix (e.g. "HR3 - Sweet about me von Gabriella Cilmi")
  if (stationName) {
    const prefix = stationName.toLowerCase() + ' - ';
    if (text.toLowerCase().startsWith(prefix)) {
      text = text.slice(prefix.length).trim();
    }
  }

  const dashIdx = text.indexOf(' - ');
  if (dashIdx !== -1) {
    const part1 = text.slice(0, dashIdx).trim();
    const part2 = text.slice(dashIdx + 3).trim();

    // If the part before " - " is the station name itself, fall through to von/by parsing
    if (stationName && part1.toLowerCase() === stationName.toLowerCase()) {
      return parseVonBy(part2);
    }

    // Standard "Artist - Title": but check if the title part also has "von/by" embedded
    // (some stations: "Gabriella Cilmi - Sweet about me" — leave as-is)
    return { artist: part1, title: part2 };
  }

  // No " - " separator — try German "Title von Artist" / "Title by Artist"
  return parseVonBy(text);
}

/** Non-music keywords that indicate ads, news, jingles, etc. */
const NON_MUSIC_PATTERNS = [
  /nachrichten/i,
  /\bnews\b/i,
  /werbung/i,
  /jingle/i,
  /wetter/i,
  /verkehr/i,
  /sport(meldung|news)?/i,
  /werbepause/i,
];

/**
 * Returns true only if the parsed track looks like an actual music track.
 * Filters out ads, news, station jingles, etc.
 */
export function isMusicTrack(track: ParsedTrack, stationName: string, rawTitle: string): boolean {
  // Must have both artist and title populated
  if (!track.artist || !track.title) return false;

  // The "title" must not be just the station name
  if (track.title.toLowerCase() === stationName.toLowerCase()) return false;
  if (track.artist.toLowerCase() === stationName.toLowerCase()) return false;

  // Reject known non-music patterns in the raw title
  for (const pattern of NON_MUSIC_PATTERNS) {
    if (pattern.test(rawTitle)) return false;
  }

  return true;
}

// ─── Poller ──────────────────────────────────────────────────────────────────

interface PollerState {
  userId: string;
  stationUrl: string;
  stationName: string;
  currentTitle: string | null;
  currentParsed: ParsedTrack | null;
  /** Duration of the currently playing track in seconds (fetched from Last.fm), or null if unknown */
  trackDuration: number | null;
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
      currentParsed: null,
      trackDuration: null,
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
   * Stop polling for a user.
   * Does NOT scrobble — the song was interrupted by the user, not finished.
   * Scrobbling only happens when a new song is detected in poll().
   */
  stop(userId: string): void {
    const state = this.pollers.get(userId);
    if (!state) return;

    if (state.timer) clearInterval(state.timer);
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

      const parsed = parseStreamTitle(rawTitle, state.stationName);
      state.currentTitle = rawTitle;
      state.trackStartTime = Date.now();
      state.trackDuration = null; // reset until fetched for the new track

      // Only update Now Playing / current track if this is actual music
      if (!isMusicTrack(parsed, state.stationName, rawTitle)) {
        state.currentParsed = null;
        logger.info(`Radio non-music content skipped: "${rawTitle}"`, { userId });
        return;
      }

      state.currentParsed = parsed;
      logger.info(`Radio track detected: "${rawTitle}" → ${parsed.artist} – ${parsed.title}`, { userId });

      // Update Last.fm Now Playing immediately — bypass the queue to avoid any lag
      void this.sendNowPlayingDirect(state.userId, parsed);

      // Fetch track duration from Last.fm in the background for the 80% scrobble threshold
      void this.fetchAndStoreTrackDuration(state, parsed);
    } catch (err) {
      logger.warn(`Radio metadata poll error`, { userId, error: String(err) });
    }
  }

  /**
   * Send a "Now Playing" update directly to Last.fm, bypassing the BullMQ queue.
   * This ensures there is zero lag between track detection and Last.fm being updated.
   */
  private async sendNowPlayingDirect(userId: string, parsed: ParsedTrack): Promise<void> {
    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
        select: { lastfmSessionKey: true, lastfmApiKey: true, lastfmApiSecret: true },
      });
      if (!settings?.lastfmSessionKey) return;

      await lastfmService.updateNowPlaying(
        settings.lastfmSessionKey,
        { artist: parsed.artist, track: parsed.title },
        { apiKey: settings.lastfmApiKey, apiSecret: settings.lastfmApiSecret },
      );
      logger.debug(`Radio now-playing sent: ${parsed.artist} – ${parsed.title}`, { userId });
    } catch (err) {
      logger.warn('Radio: failed to update Last.fm now playing', { userId, error: String(err) });
    }
  }

  /**
   * Fetch and cache the track's duration from Last.fm so the scrobble threshold
   * can be calculated as 80% of the actual track length.
   */
  private async fetchAndStoreTrackDuration(state: PollerState, parsed: ParsedTrack): Promise<void> {
    const duration = await lastfmService.getTrackDuration(parsed.artist, parsed.title);
    // Only store if this is still the same track (state may have changed while we awaited)
    if (
      state.currentParsed?.artist === parsed.artist &&
      state.currentParsed?.title === parsed.title
    ) {
      state.trackDuration = duration;
      if (duration) {
        logger.debug(
          `Radio track duration: ${parsed.artist} – ${parsed.title} = ${Math.round(duration)}s`,
          { userId: state.userId },
        );
      }
    }
  }

  private scrobbleCurrent(state: PollerState): void {
    if (!state.currentTitle || !state.trackStartTime) return;

    const playedSeconds = (Date.now() - state.trackStartTime) / 1000;
    const parsed = parseStreamTitle(state.currentTitle, state.stationName);

    // Determine minimum listen time:
    // - If we know the track duration, require 80% of it
    // - Otherwise fall back to a 30-second minimum
    const minSeconds = state.trackDuration != null
      ? state.trackDuration * MIN_SCROBBLE_RATIO
      : MIN_SCROBBLE_SECONDS;

    // Only scrobble if it's music and was played long enough
    if (
      playedSeconds >= minSeconds &&
      isMusicTrack(parsed, state.stationName, state.currentTitle)
    ) {
      const timestamp = Math.floor(state.trackStartTime / 1000);

      void scrobbleQueue.add('scrobble', {
        userId: state.userId,
        track: {
          artist: parsed.artist,
          track: parsed.title,
        },
        timestamp,
      });

      logger.info(
        `Radio scrobble queued: "${state.currentTitle}" (played ${Math.round(playedSeconds)}s / threshold ${Math.round(minSeconds)}s)`,
        { userId: state.userId },
      );
    }

    state.currentTitle = null;
    state.currentParsed = null;
    state.trackDuration = null;
    state.trackStartTime = null;
  }

  /** Returns the currently playing track for a user, or null if nothing is playing. */
  getCurrentTrack(userId: string): ParsedTrack | null {
    return this.pollers.get(userId)?.currentParsed ?? null;
  }
}

export const radioPoller = new RadioPollerManager();
