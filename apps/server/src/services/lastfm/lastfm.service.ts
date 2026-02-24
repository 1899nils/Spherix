import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

const LASTFM_ROOT = 'https://ws.audioscrobbler.com/2.0/';

export interface LastfmTrackInfo {
  artist: string;
  track: string;
  album?: string;
  duration?: number;
}

export interface LastfmConfig {
  apiKey?: string | null;
  apiSecret?: string | null;
}

/**
 * Generates a Last.fm API signature.
 * md5(param1value1param2value2...secret)
 */
function getSignature(params: Record<string, string>, secret: string): string {
  const sortedKeys = Object.keys(params).sort();
  let str = '';
  for (const key of sortedKeys) {
    if (key !== 'format' && key !== 'callback') {
      str += key + params[key];
    }
  }
  str += secret;
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * Perform a signed request to Last.fm.
 */
async function lastfmRequest<T>(
  method: string,
  params: Record<string, string> = {},
  httpMethod: 'GET' | 'POST' = 'GET',
  config: LastfmConfig = {}
): Promise<T> {
  const apiKey = config.apiKey || env.lastfmApiKey;
  const apiSecret = config.apiSecret || env.lastfmApiSecret;

  if (!apiKey || !apiSecret) {
    throw new Error('Last.fm API Key or Secret not configured');
  }

  const allParams: any = {
    ...params,
    api_key: apiKey,
    method,
    format: 'json',
  };

  const sig = getSignature(allParams, apiSecret);
  const finalParams: any = { ...allParams, api_sig: sig };

  const url = new URL(LASTFM_ROOT);
  let fetchOptions: RequestInit = { method: httpMethod };

  if (httpMethod === 'GET') {
    Object.keys(finalParams).forEach(key => url.searchParams.append(key, finalParams[key]));
  } else {
    const body = new URLSearchParams();
    Object.keys(finalParams).forEach(key => body.append(key, finalParams[key]));
    fetchOptions.body = body;
  }

  const response = await fetch(url.toString(), fetchOptions);
  const data: any = await response.json();

  if (!response.ok || data.error) {
    const msg = data.message || `Last.fm error ${data.error}`;
    logger.error('Last.fm request failed', { method, error: msg });
    throw new Error(msg);
  }

  return data as T;
}

export const lastfmService = {
  /** Get the URL for the user to authorize Spherix on Last.fm */
  getAuthUrl(apiKey: string, callbackUrl: string): string {
    return `https://www.last.fm/api/auth/?api_key=${apiKey}&cb=${encodeURIComponent(callbackUrl)}`;
  },

  /** Exchange a token for a permanent session key */
  async getSession(token: string, config: LastfmConfig): Promise<{ sessionKey: string; username: string }> {
    const data: any = await lastfmRequest('auth.getSession', { token }, 'GET', config);
    return {
      sessionKey: data.session.key,
      username: data.session.name,
    };
  },

  /** Update the "Now Playing" status on Last.fm */
  async updateNowPlaying(sessionKey: string, track: LastfmTrackInfo, config: LastfmConfig): Promise<void> {
    await lastfmRequest('track.updateNowPlaying', {
      sk: sessionKey,
      artist: track.artist,
      track: track.track,
      ...(track.album ? { album: track.album } : {}),
      ...(track.duration ? { duration: String(Math.round(track.duration)) } : {}),
    }, 'POST', config);
  },

  /** Scrobble a track to Last.fm */
  async scrobble(sessionKey: string, track: LastfmTrackInfo, timestamp: number, config: LastfmConfig): Promise<void> {
    await lastfmRequest('track.scrobble', {
      sk: sessionKey,
      artist: track.artist,
      track: track.track,
      timestamp: String(Math.round(timestamp)),
      ...(track.album ? { album: track.album } : {}),
    }, 'POST', config);
  }
};
