import crypto from 'node:crypto';
import { getCached, CACHE_TTLS } from '../cache.service.js';
import { logger } from '../../../config/logger.js';

const LASTFM_ROOT = 'https://ws.audioscrobbler.com/2.0/';

export interface LastfmConfig {
  apiKey: string;
  apiSecret: string;
}

export interface LastfmArtistInfo {
  name: string;
  mbid?: string;
  url: string;
  bio?: {
    summary: string;
    content: string;
    published?: string;
  };
  tags: string[];
  similar: string[];
  stats: {
    listeners: number;
    playcount: number;
  };
  image?: string;
}

export interface LastfmTrackInfo {
  name: string;
  artist: string;
  album?: string;
  duration?: number;
  listeners?: number;
  playcount?: number;
  tags: string[];
  wiki?: {
    summary: string;
    content: string;
  };
}

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

async function lastfmRequest<T>(
  method: string,
  params: Record<string, string>,
  config: LastfmConfig
): Promise<T> {
  const allParams: Record<string, string> = {
    ...params,
    api_key: config.apiKey,
    method,
    format: 'json',
  };

  const sig = getSignature(allParams, config.apiSecret);
  const url = new URL(LASTFM_ROOT);
  
  Object.entries({ ...allParams, api_sig: sig }).forEach(([k, v]) => {
    url.searchParams.append(k, v);
  });

  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(10_000),
  });

  const data = await response.json() as { error?: number; message?: string };

  if (!response.ok || data.error) {
    throw new Error(data.message || `Last.fm error ${data.error}`);
  }

  return data as T;
}

/**
 * Get artist info with caching
 */
export async function getArtistInfo(
  artistName: string,
  config: LastfmConfig
): Promise<LastfmArtistInfo | null> {
  const cacheKey = `lastfm:artist:${artistName.toLowerCase()}`;

  return getCached(
    cacheKey,
    async () => {
      try {
        const data = await lastfmRequest<{ artist: any }>(
          'artist.getInfo',
          { artist: artistName, autocorrect: '1' },
          config
        );

        const artist = data.artist;
        if (!artist) return null;

        return {
          name: artist.name,
          mbid: artist.mbid,
          url: artist.url,
          bio: artist.bio ? {
            summary: artist.bio.summary?.replace(/<a href=".*">.*<\/a>/, '').trim() || '',
            content: artist.bio.content?.replace(/<a href=".*">.*<\/a>/, '').trim() || '',
            published: artist.bio.published,
          } : undefined,
          tags: artist.tags?.tag?.map((t: any) => t.name) || [],
          similar: artist.similar?.artist?.map((a: any) => a.name) || [],
          stats: {
            listeners: parseInt(artist.stats?.listeners || '0'),
            playcount: parseInt(artist.stats?.playcount || '0'),
          },
          image: artist.image?.find((img: any) => img.size === 'large')?.['#text'],
        };
      } catch (error) {
        logger.warn('Last.fm artist info failed', { 
          artist: artistName,
          error: String(error) 
        });
        return null;
      }
    },
    CACHE_TTLS.lastfm
  );
}

/**
 * Get track info with caching
 */
export async function getTrackInfo(
  artistName: string,
  trackName: string,
  config: LastfmConfig
): Promise<LastfmTrackInfo | null> {
  const cacheKey = `lastfm:track:${artistName.toLowerCase()}:${trackName.toLowerCase()}`;

  return getCached(
    cacheKey,
    async () => {
      try {
        const data = await lastfmRequest<{ track: any }>(
          'track.getInfo',
          { artist: artistName, track: trackName, autocorrect: '1' },
          config
        );

        const track = data.track;
        if (!track) return null;

        return {
          name: track.name,
          artist: track.artist?.name || artistName,
          album: track.album?.title,
          duration: track.duration ? parseInt(track.duration) / 1000 : undefined,
          listeners: track.listeners ? parseInt(track.listeners) : undefined,
          playcount: track.playcount ? parseInt(track.playcount) : undefined,
          tags: track.toptags?.tag?.map((t: any) => t.name) || [],
          wiki: track.wiki ? {
            summary: track.wiki.summary,
            content: track.wiki.content,
          } : undefined,
        };
      } catch (error) {
        logger.warn('Last.fm track info failed', { 
          artist: artistName,
          track: trackName,
          error: String(error) 
        });
        return null;
      }
    },
    CACHE_TTLS.lastfm
  );
}

/**
 * Get similar artists with caching
 */
export async function getSimilarArtists(
  artistName: string,
  limit: number = 10,
  config: LastfmConfig
): Promise<string[]> {
  const cacheKey = `lastfm:similar:${artistName.toLowerCase()}:${limit}`;

  return getCached(
    cacheKey,
    async () => {
      try {
        const data = await lastfmRequest<{ similarartists: { artist: any[] } }>(
          'artist.getSimilar',
          { artist: artistName, limit: String(limit), autocorrect: '1' },
          config
        );

        return data.similarartists?.artist?.map((a: any) => a.name) || [];
      } catch (error) {
        logger.warn('Last.fm similar artists failed', { 
          artist: artistName,
          error: String(error) 
        });
        return [];
      }
    },
    CACHE_TTLS.similarArtists
  );
}

/**
 * Get artist top tags with caching
 */
export async function getArtistTopTags(
  artistName: string,
  config: LastfmConfig
): Promise<string[]> {
  const cacheKey = `lastfm:toptags:${artistName.toLowerCase()}`;

  return getCached(
    cacheKey,
    async () => {
      try {
        const data = await lastfmRequest<{ toptags: { tag: any[] } }>(
          'artist.getTopTags',
          { artist: artistName, autocorrect: '1' },
          config
        );

        return data.toptags?.tag?.slice(0, 5).map((t: any) => t.name) || [];
      } catch (error) {
        logger.warn('Last.fm top tags failed', { 
          artist: artistName,
          error: String(error) 
        });
        return [];
      }
    },
    CACHE_TTLS.lastfm
  );
}
