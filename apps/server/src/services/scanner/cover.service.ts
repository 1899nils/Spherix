import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
export interface IPicture {
  data: Uint8Array;
  format: string;
}
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';

const COVERS_DIR = path.join(env.dataDir, 'covers');

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** Candidate filenames to look for when there is no embedded cover art */
const FOLDER_COVER_NAMES = [
  'cover', 'folder', 'Folder', 'Cover', 'front', 'Front', 'album', 'Album',
];
const FOLDER_COVER_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

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

    return `/api/covers/${filename}`;
  } catch (error) {
    logger.warn('Failed to save cover art', { error });
    return null;
  }
}

/**
 * Looks for a cover image file (cover.jpg, folder.jpg, etc.) in the same directory
 * as the given audio file. Returns the URL path if found, null otherwise.
 */
export async function saveFolderCover(audioFilePath: string): Promise<string | null> {
  const dir = path.dirname(audioFilePath);

  for (const name of FOLDER_COVER_NAMES) {
    for (const ext of FOLDER_COVER_EXTS) {
      const candidate = path.join(dir, `${name}${ext}`);
      try {
        const data = await fs.readFile(candidate);
        const mime = EXT_TO_MIME[ext] ?? 'image/jpeg';
        return await saveCoverArt([{ data: new Uint8Array(data), format: mime }]);
      } catch {
        // File doesn't exist, try next candidate
      }
    }
  }

  return null;
}
