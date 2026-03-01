/**
 * Audiobook Library Scanner
 *
 * Expected folder layout (two supported conventions):
 *
 *  A) Author / Title (Year) / chapter01.mp3   ← multi-chapter, one file per chapter
 *  B) Author / Title (Year).m4b               ← single m4b file with embedded chapters
 *  C) Title (Year).m4b                        ← single file, no author subfolder
 *
 * Uses the `music-metadata` library (already installed) to:
 *   - Read embedded tags (artist, title, album, year)
 *   - Read embedded cover art
 *   - Detect embedded chapters (m4b/mp4 chapter marks)
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { parseFile as mmParseFile } from 'music-metadata';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { saveCoverArt, saveFolderCover } from './cover.service.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const AUDIO_EXTS = new Set([
  '.m4b', '.m4a', '.mp3', '.flac',
  '.ogg', '.opus', '.aac', '.wav',
]);

// Cover image file candidates (looked up in the book directory)
const COVER_NAMES = ['cover', 'folder', 'front', 'artwork', 'book'];
const COVER_EXTS  = ['.jpg', '.jpeg', '.png', '.webp'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function listAudioFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && AUDIO_EXTS.has(path.extname(e.name).toLowerCase()))
      .map(e => path.join(dir, e.name))
      .sort(); // natural order keeps chapters in sequence
  } catch {
    return [];
  }
}

async function listSubdirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/**
 * Parse author + title from:
 *   "Title (Year)"
 *   "Author - Title (Year)"
 *   "Author, Firstname - Title"
 */
function parseFolderName(name: string): { author: string | null; title: string; year: number | null } {
  const yearMatch = name.match(/\((\d{4})\)/);
  const year      = yearMatch ? parseInt(yearMatch[1], 10) : null;
  const cleaned   = name.replace(/\(\d{4}\)/, '').trim().replace(/\s+$/, '');

  if (cleaned.includes(' - ')) {
    const dashIdx  = cleaned.indexOf(' - ');
    return { author: cleaned.slice(0, dashIdx).trim(), title: cleaned.slice(dashIdx + 3).trim(), year };
  }
  return { author: null, title: cleaned.trim() || name, year };
}

async function findCoverInDir(dir: string): Promise<string | null> {
  for (const name of COVER_NAMES) {
    for (const ext of COVER_EXTS) {
      try {
        const data = await fs.readFile(path.join(dir, `${name}${ext}`));
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        const url  = await saveCoverArt([{ data: new Uint8Array(data), format: mime }]);
        if (url) return url;
      } catch { /* not found */ }
    }
  }
  return null;
}

/**
 * Read music-metadata tags from a file. Returns partial — all fields optional.
 */
async function readTags(filePath: string): Promise<{
  title:    string | null;
  author:   string | null;
  year:     number | null;
  duration: number | null;   // seconds
  coverUrl: string | null;
  chapters: Array<{ title: string; startTime: number; endTime?: number }>;
}> {
  try {
    const meta = await mmParseFile(filePath, { duration: true, skipCovers: false });
    const c    = meta.common;
    const f    = meta.format;

    // Embedded cover art
    let coverUrl: string | null = null;
    if (c.picture && c.picture.length > 0) {
      const pic = c.picture[0];
      coverUrl = await saveCoverArt([{ data: pic.data, format: pic.format }]);
    }
    if (!coverUrl) coverUrl = await saveFolderCover(filePath);

    // Embedded chapters (m4b / MP4 chpl atoms or ID3 CHAP frames)
    const rawChapters = (meta as unknown as { chapters?: Array<{ title?: string; startTime?: number; endTime?: number }> }).chapters ?? [];
    const chapters = rawChapters.map((ch, i) => ({
      title:     ch.title ?? `Chapter ${i + 1}`,
      startTime: Math.round(ch.startTime ?? 0),
      endTime:   ch.endTime != null ? Math.round(ch.endTime) : undefined,
    }));

    return {
      title:    c.title   ?? c.album ?? null,
      author:   c.artist  ?? c.albumartist ?? null,
      year:     c.year    ?? null,
      duration: f.duration != null ? Math.round(f.duration) : null,
      coverUrl,
      chapters,
    };
  } catch (err) {
    logger.debug(`[AudiobookScanner] Tag read failed for ${filePath}: ${String(err)}`);
    return { title: null, author: null, year: null, duration: null, coverUrl: null, chapters: [] };
  }
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export interface AudiobookScanProgress {
  phase:    'discovering' | 'scanning' | 'cleanup' | 'done' | 'error';
  total:    number;
  done:     number;
  books:    number;
  chapters: number;
  skipped:  number;
  errors:   number;
  message?: string;
}

export async function scanAudiobookLibrary(): Promise<AudiobookScanProgress> {
  const rootPath = env.audiobookPath;
  const progress: AudiobookScanProgress = {
    phase: 'discovering', total: 0, done: 0,
    books: 0, chapters: 0, skipped: 0, errors: 0,
  };

  if (!fsSync.existsSync(rootPath)) {
    logger.warn(`[AudiobookScanner] AUDIOBOOK_PATH does not exist: ${rootPath}`);
    progress.phase   = 'done';
    progress.message = `AUDIOBOOK_PATH (${rootPath}) not found — skipping`;
    return progress;
  }

  logger.info(`[AudiobookScanner] Scanning ${rootPath}`);
  progress.phase = 'scanning';

  // ── Collect candidate audiobook locations ─────────────────────────────────
  // Level 1: files directly in rootPath (.m4b)
  // Level 2: subdirs of rootPath (Author folders OR Book folders)
  // Level 3: subdirs of Author folders (Book folders)

  const processedBookIds = new Set<string>();

  /**
   * Process a single "book directory" — one or more audio files = one audiobook.
   * authorHint: passed from parent when traversing Author/Book structure.
   */
  async function processBookDir(bookDir: string, authorHint: string | null): Promise<void> {
    const audioFiles = await listAudioFiles(bookDir);
    if (audioFiles.length === 0) return;

    const dirName = path.basename(bookDir);
    const parsed  = parseFolderName(dirName);
    const author  = authorHint ?? parsed.author;
    const title   = parsed.title;
    const year    = parsed.year;

    // Read tags from the first file (sufficient for metadata)
    const tags = await readTags(audioFiles[0]);

    const finalTitle  = tags.title  ?? title;
    const finalAuthor = tags.author ?? author;
    const finalYear   = tags.year   ?? year;
    const coverUrl    = tags.coverUrl ?? await findCoverInDir(bookDir);

    // Deduplicate by title + author
    const existing = await prisma.audiobook.findFirst({
      where:  { title: finalTitle, ...(finalAuthor ? { author: finalAuthor } : {}) },
      select: { id: true },
    });
    if (existing) { processedBookIds.add(existing.id); progress.skipped++; return; }

    // Single-file book
    const isSingleFile = audioFiles.length === 1;

    // For m4b: read duration from the single file
    let totalDuration = tags.duration;
    if (!isSingleFile) {
      // Sum durations across all chapter files
      let sum = 0;
      for (const f of audioFiles) {
        const t = await readTags(f);
        sum += t.duration ?? 0;
      }
      totalDuration = sum || null;
    }

    const book = await prisma.audiobook.create({
      data: {
        title:         finalTitle,
        sortTitle:     finalTitle.toLowerCase(),
        author:        finalAuthor,
        year:          finalYear,
        duration:      totalDuration,
        coverPath:     coverUrl,
        filePath:      isSingleFile ? audioFiles[0] : null,
      },
    });
    processedBookIds.add(book.id);
    progress.books++;

    // ── Chapters ─────────────────────────────────────────────────────────────
    if (isSingleFile && tags.chapters.length > 0) {
      // Embedded chapters from m4b
      for (let i = 0; i < tags.chapters.length; i++) {
        const ch = tags.chapters[i];
        await prisma.audiobookChapter.create({
          data: {
            audiobookId: book.id,
            number:      i + 1,
            title:       ch.title,
            startTime:   ch.startTime,
            endTime:     ch.endTime ?? null,
            filePath:    audioFiles[0],
          },
        });
        progress.chapters++;
      }
    } else if (!isSingleFile) {
      // One file per chapter
      for (let i = 0; i < audioFiles.length; i++) {
        const chFile  = audioFiles[i];
        const chTags  = await readTags(chFile);
        const chTitle = chTags.title ?? path.basename(chFile, path.extname(chFile));

        // Compute cumulative start time from previous chapters
        let startTime = 0;
        for (let j = 0; j < i; j++) {
          const prevTags = await readTags(audioFiles[j]);
          startTime += prevTags.duration ?? 0;
        }

        await prisma.audiobookChapter.create({
          data: {
            audiobookId: book.id,
            number:      i + 1,
            title:       chTitle,
            startTime,
            endTime:     startTime + (chTags.duration ?? 0) || null,
            filePath:    chFile,
          },
        });
        progress.chapters++;
      }
    }

    progress.done++;
  }

  // ── Single .m4b files directly in rootPath ────────────────────────────────
  const rootFiles = await listAudioFiles(rootPath);
  progress.total += rootFiles.length;
  for (const f of rootFiles) {
    try { await processBookDir(path.dirname(f) + '/__single__' + path.basename(f), null); }
    catch { /* handled below */ }
  }

  // Actually process single files directly
  for (const filePath of rootFiles) {
    try {
      const existing = await prisma.audiobook.findFirst({ where: { filePath }, select: { id: true } });
      if (existing) { processedBookIds.add(existing.id); progress.skipped++; continue; }

      const dirName  = path.basename(filePath, path.extname(filePath));
      const parsed   = parseFolderName(dirName);
      const tags     = await readTags(filePath);
      const title    = tags.title  ?? parsed.title;
      const author   = tags.author ?? parsed.author;
      const coverUrl = tags.coverUrl;

      const book = await prisma.audiobook.create({
        data: {
          title,
          sortTitle: title.toLowerCase(),
          author,
          year:      tags.year ?? parsed.year,
          duration:  tags.duration,
          coverPath: coverUrl,
          filePath,
        },
      });
      processedBookIds.add(book.id);
      progress.books++;

      // Embedded chapters
      for (let i = 0; i < tags.chapters.length; i++) {
        const ch = tags.chapters[i];
        await prisma.audiobookChapter.create({
          data: {
            audiobookId: book.id,
            number:      i + 1,
            title:       ch.title,
            startTime:   ch.startTime,
            endTime:     ch.endTime ?? null,
            filePath,
          },
        });
        progress.chapters++;
      }
      progress.done++;
    } catch (err) {
      logger.error(`[AudiobookScanner] Error: ${filePath}`, err);
      progress.errors++;
    }
  }

  // ── Traverse Author / Book subdirectory structure ─────────────────────────
  const level1Dirs = await listSubdirs(rootPath);
  for (const dir1 of level1Dirs) {
    const audioFiles = await listAudioFiles(dir1);
    const subDirs    = await listSubdirs(dir1);

    if (audioFiles.length > 0 && subDirs.length === 0) {
      // dir1 IS the book folder (Author/Title or just Title layout without nesting)
      progress.total++;
      try { await processBookDir(dir1, null); }
      catch (err) { logger.error(`[AudiobookScanner] Error: ${dir1}`, err); progress.errors++; }
    } else {
      // dir1 is an Author folder — each subdir is a book
      const authorHint = path.basename(dir1);
      for (const dir2 of subDirs) {
        progress.total++;
        try { await processBookDir(dir2, authorHint); }
        catch (err) { logger.error(`[AudiobookScanner] Error: ${dir2}`, err); progress.errors++; }
      }
    }
  }

  // ── Cleanup: remove books whose files no longer exist ─────────────────────
  progress.phase = 'cleanup';

  const allBooks = await prisma.audiobook.findMany({ select: { id: true, filePath: true } });
  for (const book of allBooks) {
    if (processedBookIds.has(book.id)) continue;
    if (book.filePath && !fsSync.existsSync(book.filePath)) {
      await prisma.audiobook.delete({ where: { id: book.id } });
      logger.info(`[AudiobookScanner] Removed missing audiobook ${book.id}`);
    }
  }

  progress.phase   = 'done';
  progress.message =
    `Scan complete — books: ${progress.books}, chapters: ${progress.chapters}, ` +
    `skipped: ${progress.skipped}, errors: ${progress.errors}`;
  logger.info(`[AudiobookScanner] ${progress.message}`);

  return progress;
}
