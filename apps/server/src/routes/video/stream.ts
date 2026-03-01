/**
 * Generic HTTP Range Request streaming utility (RFC 7233).
 *
 * Implements Plex-style seekable streaming:
 *  - 206 Partial Content with correct Content-Range for any byte range
 *  - Full 200 response when no Range header is present
 *  - 304 Not Modified via ETag + If-None-Match
 *  - 416 Range Not Satisfiable for malformed / out-of-bounds ranges
 *  - Content-Type detection by file extension
 *  - Cache-Control + ETag for efficient browser/player caching
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';

export const VIDEO_MIME: Record<string, string> = {
  '.mp4':  'video/mp4',
  '.m4v':  'video/mp4',
  '.webm': 'video/webm',
  '.mkv':  'video/x-matroska',
  '.avi':  'video/x-msvideo',
  '.mov':  'video/quicktime',
  '.wmv':  'video/x-ms-wmv',
  '.ts':   'video/mp2t',
  '.ogv':  'video/ogg',
  '.3gp':  'video/3gpp',
};

/**
 * Stream a file with full Range Request support.
 * @param mimeTypes  Override the MIME type map (e.g. for audio files).
 */
export function streamFile(
  req: Request,
  res: Response,
  filePath: string,
  mimeTypes: Record<string, string> = VIDEO_MIME,
): void {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found on disk' });
    return;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.status(500).json({ error: 'Cannot read file metadata' });
    return;
  }

  const fileSize    = stat.size;
  const ext         = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] ?? 'application/octet-stream';

  // Weak ETag: mtime (base-36) + size (base-36)
  const etag = `W/"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}"`;

  // Conditional GET — 304 if nothing changed
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }

  res.setHeader('Content-Type',   contentType);
  res.setHeader('Accept-Ranges',  'bytes');
  res.setHeader('ETag',           etag);
  res.setHeader('Last-Modified',  stat.mtime.toUTCString());
  // 1 hour client cache, must revalidate after expiry
  res.setHeader('Cache-Control',  'public, max-age=3600, must-revalidate');

  const rangeHeader = req.headers.range;

  if (!rangeHeader) {
    // No Range header — serve the full file (e.g. download)
    res.writeHead(200, { 'Content-Length': fileSize });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Parse "bytes=start-end" (RFC 7233 §2.1)
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) {
    res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
    return;
  }

  const startStr = match[1];
  const endStr   = match[2];

  // Suffix range: bytes=-N means last N bytes
  let start: number;
  let end: number;

  if (!startStr && endStr) {
    // Suffix range: "bytes=-500" → last 500 bytes
    start = Math.max(0, fileSize - parseInt(endStr, 10));
    end   = fileSize - 1;
  } else {
    start = startStr ? parseInt(startStr, 10) : 0;
    end   = endStr   ? parseInt(endStr,   10) : fileSize - 1;
  }

  // Clamp end to last byte
  if (end >= fileSize) end = fileSize - 1;

  if (isNaN(start) || isNaN(end) || start < 0 || start > end) {
    res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
    return;
  }

  const chunkSize = end - start + 1;

  res.writeHead(206, {
    'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
    'Content-Length': chunkSize,
  });

  fs.createReadStream(filePath, { start, end }).pipe(res);
}
