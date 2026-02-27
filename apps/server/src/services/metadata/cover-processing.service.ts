import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { logger } from '../../config/logger.js';

const COVERS_BASE = '/data/covers';

interface ProcessedCover {
  /** URL path for the 500x500 cover */
  url500: string;
  /** URL path for the 300x300 cover */
  url300: string;
}

/**
 * Process and save an uploaded cover image.
 * Resizes to 500x500 and 300x300, saves in /data/covers/{albumId}/.
 * Returns the URL paths for both sizes.
 */
export async function processAndSaveCover(
  inputBuffer: Buffer,
  albumId: string,
): Promise<ProcessedCover> {
  const dir = path.join(COVERS_BASE, albumId);
  await fs.mkdir(dir, { recursive: true });

  const [buf500, buf300] = await Promise.all([
    sharp(inputBuffer)
      .resize(500, 500, { fit: 'cover' })
      .jpeg({ quality: 90 })
      .toBuffer(),
    sharp(inputBuffer)
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 85 })
      .toBuffer(),
  ]);

  const file500 = 'cover-500.jpg';
  const file300 = 'cover-300.jpg';

  await Promise.all([
    fs.writeFile(path.join(dir, file500), buf500),
    fs.writeFile(path.join(dir, file300), buf300),
  ]);

  logger.info(`Saved cover art for album ${albumId}`);

  return {
    url500: `/api/covers/${albumId}/${file500}`,
    url300: `/api/covers/${albumId}/${file300}`,
  };
}

/**
 * Ensure a URL uses HTTPS. Cover Art Archive URLs sometimes use http://.
 */
function ensureHttps(url: string): string {
  if (url.startsWith('http://')) {
    return 'https://' + url.slice(7);
  }
  return url;
}

/**
 * Download a cover image from a URL and process/save it locally.
 * Handles CAA redirects (307 → Internet Archive) and retries on transient errors.
 * Returns the local URL paths, or null if the download fails.
 */
export async function downloadAndSaveCover(
  imageUrl: string,
  albumId: string,
): Promise<ProcessedCover | null> {
  const safeUrl = ensureHttps(imageUrl);
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        logger.debug(`Cover download retry ${attempt}/${maxRetries} for album ${albumId}`);
      }

      const res = await fetch(safeUrl, {
        headers: { 'User-Agent': 'Spherix/1.0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(25_000),
      });

      if (res.status === 503 || res.status === 429) {
        logger.warn(`Cover download got ${res.status}, retrying...`, { imageUrl: safeUrl, albumId });
        continue;
      }

      if (!res.ok) {
        logger.warn(`Failed to download cover art: ${res.status} ${res.statusText}`, { imageUrl: safeUrl, albumId });
        return null;
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) {
        logger.warn(`Cover art response is not an image: ${contentType}`, { imageUrl: safeUrl, albumId });
        return null;
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 100) {
        logger.warn(`Cover art response too small (${buffer.length} bytes)`, { imageUrl: safeUrl, albumId });
        return null;
      }

      return await processAndSaveCover(buffer, albumId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries && (msg.includes('timeout') || msg.includes('fetch failed'))) {
        logger.warn(`Cover download attempt ${attempt + 1} failed, retrying`, { imageUrl: safeUrl, error: msg });
        continue;
      }
      logger.warn('Error downloading cover art', { imageUrl: safeUrl, albumId, error: msg });
      return null;
    }
  }

  logger.warn(`Cover download exhausted retries for album ${albumId}`, { imageUrl: safeUrl });
  return null;
}
