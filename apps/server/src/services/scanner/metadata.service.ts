import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../config/logger.js';
import { saveCoverArt } from './cover.service.js';

// music-metadata types for the fields we use
interface IPicture {
  data: Uint8Array;
  format: string;
}

interface IAudioMetadata {
  common: {
    title?: string;
    artist?: string;
    album?: string;
    track?: { no: number | null };
    disk?: { no: number | null };
    year?: number;
    genre?: string[];
    picture?: IPicture[];
    musicbrainz_trackid?: string;
    musicbrainz_albumid?: string;
    musicbrainz_artistid?: string[];
  };
  format: {
    duration?: number;
    bitrate?: number;
    sampleRate?: number;
    numberOfChannels?: number;
    container?: string;
  };
  native: Record<string, Array<{ id: string; value: unknown }>>;
}

// Lazy-loaded parseFile to avoid moduleResolution mismatch
// (bundler resolves "default" condition → core.js, but Node uses "node" condition → index.js)
let _parseFile: ((path: string) => Promise<IAudioMetadata>) | null = null;

async function getParseFile(): Promise<(path: string) => Promise<IAudioMetadata>> {
  if (!_parseFile) {
    // Dynamic import with type assertion — at runtime Node.js resolves the "node"
    // export condition which includes parseFile, but TS sees the "default" condition (core.js)
    const mm = (await import('music-metadata')) as unknown as {
      parseFile: (path: string) => Promise<IAudioMetadata>;
    };
    if (typeof mm.parseFile !== 'function') {
      const available = Object.keys(mm).join(', ');
      throw new Error(
        `music-metadata did not export parseFile. Available exports: ${available}`,
      );
    }
    _parseFile = mm.parseFile;
  }
  return _parseFile;
}

export interface ExtractedMetadata {
  title: string;
  artistName: string;
  albumTitle: string | null;
  trackNumber: number;
  discNumber: number;
  year: number | null;
  genre: string | null;
  duration: number;
  bitrate: number | null;
  sampleRate: number | null;
  channels: number | null;
  format: string;
  fileSize: bigint;
  coverUrl: string | null;
  musicbrainzTrackId: string | null;
  musicbrainzAlbumId: string | null;
  musicbrainzArtistId: string | null;
}

/**
 * Extracts audio metadata from a file using music-metadata.
 */
export async function extractMetadata(
  filePath: string,
): Promise<ExtractedMetadata> {
  const stat = await fs.stat(filePath);
  let metadata: IAudioMetadata | null = null;
  
  try {
    const parseFile = await getParseFile();
    metadata = await parseFile(filePath);
  } catch (error) {
    logger.warn(`Failed to parse metadata for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    // Fallback to basic info from filename/stats
    return {
      title: path.basename(filePath, path.extname(filePath)),
      artistName: 'Unknown Artist',
      albumTitle: null,
      trackNumber: 1,
      discNumber: 1,
      year: null,
      genre: null,
      duration: 0,
      bitrate: null,
      sampleRate: null,
      channels: null,
      format: path.extname(filePath).slice(1).toLowerCase() || 'unknown',
      fileSize: BigInt(stat.size),
      coverUrl: null,
      musicbrainzTrackId: null,
      musicbrainzAlbumId: null,
      musicbrainzArtistId: null,
    };
  }

  const { common, format } = metadata;

  // Extract MusicBrainz IDs from native tags if not in common
  let mbTrackId = common.musicbrainz_trackid || null;
  let mbAlbumId = common.musicbrainz_albumid || null;
  let mbArtistId = common.musicbrainz_artistid?.[0] || null;

  // Also check TXXX frames for ID3v2
  if (metadata.native) {
    for (const tagType of Object.keys(metadata.native)) {
      for (const tag of metadata.native[tagType]) {
        if (!mbTrackId && tag.id === 'TXXX:MusicBrainz Track Id') {
          mbTrackId = tag.value as string;
        }
        if (!mbAlbumId && tag.id === 'TXXX:MusicBrainz Album Id') {
          mbAlbumId = tag.value as string;
        }
        if (!mbArtistId && tag.id === 'TXXX:MusicBrainz Artist Id') {
          mbArtistId = tag.value as string;
        }
      }
    }
  }

  const coverUrl = await saveCoverArt(common.picture);

  const ext = path.extname(filePath).slice(1).toLowerCase();
  const audioFormat = format.container || ext || 'unknown';

  return {
    title: common.title || path.basename(filePath, path.extname(filePath)),
    artistName: common.artist || 'Unknown Artist',
    albumTitle: common.album || null,
    trackNumber: common.track?.no || 1,
    discNumber: common.disk?.no || 1,
    year: common.year || null,
    genre: common.genre?.[0] || null,
    duration: format.duration || 0,
    bitrate: format.bitrate ? Math.round(format.bitrate) : null,
    sampleRate: format.sampleRate || null,
    channels: format.numberOfChannels || null,
    format: audioFormat,
    fileSize: BigInt(stat.size),
    coverUrl,
    musicbrainzTrackId: mbTrackId,
    musicbrainzAlbumId: mbAlbumId,
    musicbrainzArtistId: mbArtistId,
  };
}
