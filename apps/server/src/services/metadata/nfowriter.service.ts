import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../config/logger.js';

export interface NfoTrack {
  position: number;
  discNumber?: number | null;
  title: string;
  musicbrainzId?: string | null;
}

export interface AlbumNfoData {
  title: string;
  artistName: string;
  year?: number | null;
  genre?: string | null;
  label?: string | null;
  country?: string | null;
  musicbrainzAlbumId?: string | null;
  musicbrainzArtistId?: string | null;
  tracks?: NfoTrack[];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function tag(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  return `  <${name}>${escapeXml(String(value))}</${name}>\n`;
}

function buildNfo(data: AlbumNfoData): string {
  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<album>\n';
  xml += tag('title', data.title);
  xml += tag('artist', data.artistName);
  xml += tag('year', data.year);
  xml += tag('genre', data.genre);
  xml += tag('label', data.label);
  xml += tag('country', data.country);
  xml += tag('musicbrainzalbumid', data.musicbrainzAlbumId);
  xml += tag('musicbrainzalbumartistid', data.musicbrainzArtistId);

  for (const t of data.tracks ?? []) {
    xml += '  <track>\n';
    if (t.discNumber != null && t.discNumber > 1) {
      xml += `    <disc>${t.discNumber}</disc>\n`;
    }
    xml += `    <position>${t.position}</position>\n`;
    xml += `    <title>${escapeXml(t.title)}</title>\n`;
    if (t.musicbrainzId) {
      xml += `    <musicbrainztrackid>${escapeXml(t.musicbrainzId)}</musicbrainztrackid>\n`;
    }
    xml += '  </track>\n';
  }

  xml += '</album>\n';
  return xml;
}

/**
 * Writes an album.nfo file into the given folder.
 * Safe to call multiple times — overwrites existing NFO.
 */
export async function writeAlbumNfo(albumFolder: string, data: AlbumNfoData): Promise<void> {
  const nfoPath = path.join(albumFolder, 'album.nfo');
  const content = buildNfo(data);
  await fs.writeFile(nfoPath, content, 'utf-8');
  logger.info(`NFO written: ${nfoPath}`);
}
