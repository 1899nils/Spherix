/**
 * Audiobook Library Scanner
 *
 * Scans a directory tree for audiobook files. Handles both:
 *  - Single-file audiobooks (.m4b, large .mp3)
 *  - Multi-chapter audiobooks (one file per chapter in a folder)
 *
 * Folder naming convention expected:
 *   Author/Title (Year)/chapter01.mp3
 *   Author - Title/...
 *
 * TODO: Read embedded tags (ID3, MP4) for author, narrator, year, chapters.
 *       Integrate Audible / OpenLibrary for cover art and description.
 */
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';

const AUDIOBOOK_EXTENSIONS = new Set([
  '.m4b',  // primary audiobook format
  '.m4a',
  '.mp3',
  '.flac',
  '.ogg',
  '.opus',
  '.aac',
]);

// Heuristic: a directory is an "audiobook" if it contains >= 2 audio files
const MULTI_CHAPTER_THRESHOLD = 2;

export interface AudiobookScanOptions {
  libraryPath: string;
  force?: boolean;
}

export interface AudiobookScanResult {
  books:    number;
  chapters: number;
  skipped:  number;
  errors:   number;
}

function getAudioFiles(dir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(e => e.isFile() && AUDIOBOOK_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map(e => path.join(dir, e.name))
    .sort(); // natural sort keeps chapter order for most naming schemes
}

function walkTopLevel(dir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter(e => e.isDirectory()).map(e => path.join(dir, e.name));
}

/** Parse "Author - Title (Year)" or "Title (Year)" directory names. */
function parseBookDir(dirName: string): { author: string | null; title: string; year: number | null } {
  const yearMatch = dirName.match(/\((\d{4})\)/);
  const year      = yearMatch ? parseInt(yearMatch[1], 10) : null;
  const cleaned   = dirName.replace(/\(\d{4}\)/, '').replace(/\s+$/, '');

  if (cleaned.includes(' - ')) {
    const [authorPart, ...rest] = cleaned.split(' - ');
    return { author: authorPart.trim(), title: rest.join(' - ').trim(), year };
  }

  return { author: null, title: cleaned.trim(), year };
}

/**
 * Main scan function.
 * Treats each sub-directory as a single audiobook; files within are chapters.
 * A lone .m4b file in the root is treated as a single-file audiobook.
 */
export async function scanAudiobookLibrary(options: AudiobookScanOptions): Promise<AudiobookScanResult> {
  const { libraryPath, force = false } = options;
  const result: AudiobookScanResult = { books: 0, chapters: 0, skipped: 0, errors: 0 };

  logger.info(`[AudiobookScanner] Starting scan: ${libraryPath}`);

  // 1. Single .m4b files directly in libraryPath
  const rootFiles = getAudioFiles(libraryPath).filter(f => path.extname(f).toLowerCase() === '.m4b');
  for (const filePath of rootFiles) {
    try {
      const existing = await prisma.audiobook.findFirst({ where: { filePath }, select: { id: true } });
      if (existing && !force) { result.skipped++; continue; }

      const baseName = path.basename(filePath, '.m4b');
      const { author, title, year } = parseBookDir(baseName);
      const stat  = fs.statSync(filePath);

      await prisma.audiobook.upsert({
        where:  { id: existing?.id ?? '' },
        update: { updatedAt: new Date() },
        create: { title, sortTitle: title.toLowerCase(), author, year, filePath },
      });
      result.books++;
    } catch (err) {
      logger.error(`[AudiobookScanner] Error processing single file ${filePath}:`, err);
      result.errors++;
    }
  }

  // 2. Subdirectories — each is one audiobook
  const bookDirs = walkTopLevel(libraryPath);
  for (const bookDir of bookDirs) {
    try {
      const audioFiles = getAudioFiles(bookDir);
      if (audioFiles.length === 0) continue;

      const dirName        = path.basename(bookDir);
      const { author, title, year } = parseBookDir(dirName);

      // Check if already scanned
      const existing = await prisma.audiobook.findFirst({
        where: { title, ...(author ? { author } : {}) },
        select: { id: true, chapters: { select: { filePath: true } } },
      });

      if (existing && !force) { result.skipped++; continue; }

      const book = await prisma.audiobook.upsert({
        where:  { id: existing?.id ?? '' },
        update: { updatedAt: new Date() },
        create: {
          title,
          sortTitle: title.toLowerCase(),
          author,
          year,
          // Single-file audiobooks set filePath on the book itself
          filePath: audioFiles.length === 1 ? audioFiles[0] : null,
        },
      });

      result.books++;

      // Create chapters for multi-file audiobooks
      if (audioFiles.length >= MULTI_CHAPTER_THRESHOLD) {
        for (let i = 0; i < audioFiles.length; i++) {
          const chapterPath = audioFiles[i];
          const chapterNum  = i + 1;
          const chapterName = path.basename(chapterPath, path.extname(chapterPath));

          await prisma.audiobookChapter.upsert({
            where:  { audiobookId_number: { audiobookId: book.id, number: chapterNum } },
            update: { filePath: chapterPath },
            create: {
              audiobookId: book.id,
              number:      chapterNum,
              title:       chapterName,
              startTime:   0,   // Accurate start/end times require reading audio tags
              filePath:    chapterPath,
            },
          });
          result.chapters++;
        }
      }
    } catch (err) {
      logger.error(`[AudiobookScanner] Error processing directory ${bookDir}:`, err);
      result.errors++;
    }
  }

  logger.info(
    `[AudiobookScanner] Done — books: ${result.books}, chapters: ${result.chapters}, ` +
    `skipped: ${result.skipped}, errors: ${result.errors}`,
  );

  return result;
}
