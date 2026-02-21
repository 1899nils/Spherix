import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export interface IPicture {
  data: Uint8Array;
  format: string;
}
import { logger } from '../../config/logger.js';

const COVERS_DIR = '/data/covers';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

async function ensureCoversDir(): Promise<void> {
  await fs.mkdir(COVERS_DIR, { recursive: true });
}

/**
 * Saves embedded cover art to disk and returns the relative URL path.
 * Uses a content hash as filename to deduplicate identical covers.
 */
export async function saveCoverArt(
  pictures: IPicture[] | undefined,
): Promise<string | null> {
  if (!pictures || pictures.length === 0) {
    return null;
  }

  const picture = pictures[0];
  if (!picture.data || picture.data.length === 0) {
    return null;
  }

  try {
    await ensureCoversDir();

    const hash = crypto.createHash('sha256').update(picture.data).digest('hex');
    const ext = MIME_TO_EXT[picture.format] || '.jpg';
    const filename = `${hash}${ext}`;
    const filePath = path.join(COVERS_DIR, filename);

    // Skip writing if file already exists (same content hash)
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, picture.data);
    }

    return `/covers/${filename}`;
  } catch (error) {
    logger.warn('Failed to save cover art', { error });
    return null;
  }
}
