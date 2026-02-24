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
 * Download a cover image from a URL and process/save it locally.
 * Returns the local URL paths, or null if the download fails.
 */
export async function downloadAndSaveCover(
  imageUrl: string,
  albumId: string,
): Promise<ProcessedCover | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'MusicServer/1.0' },
    });
    if (!res.ok) {
      logger.warn(`Failed to download cover art: ${res.status} ${res.statusText}`, { imageUrl });
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    return await processAndSaveCover(buffer, albumId);
  } catch (err) {
    logger.warn('Error downloading cover art', { imageUrl, error: String(err) });
    return null;
  }
}
