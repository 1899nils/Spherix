/**
 * Video Library Scanner
 *
 * Scans a directory tree for video files, creates/updates Movie and Series
 * records in the database. Uses heuristics to distinguish standalone movies
 * from series episodes (e.g. S01E02 pattern in filename).
 *
 * TODO: Integrate TheMovieDB (TMDB) API for metadata enrichment
 *       (poster, backdrop, overview, genres, runtime).
 */
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';

// Supported video extensions
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.m4v', '.mkv', '.webm', '.avi', '.mov',
  '.wmv', '.ts',  '.ogv', '.3gp', '.flv',
]);

// Regex to detect series episode files: S01E02, 1x02, etc.
const EPISODE_PATTERN = /[Ss](\d{1,3})[Ee](\d{1,3})|(\d{1,2})x(\d{2})/;

export interface VideoScanOptions {
  libraryPath: string;
  /** If true, re-scan files already in the database */
  force?: boolean;
}

export interface VideoScanResult {
  movies:   number;
  episodes: number;
  skipped:  number;
  errors:   number;
}

/**
 * Walk a directory recursively and collect all video file paths.
 */
function walkDir(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    logger.warn(`[VideoScanner] Cannot read directory: ${dir}`);
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (VIDEO_EXTENSIONS.has(ext)) results.push(fullPath);
    }
  }

  return results;
}

/**
 * Parse year from a string like "Movie Title (2023)" or "Movie Title 2023".
 */
function parseYear(str: string): number | null {
  const match = str.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Clean a filename into a human-readable title.
 * Strips year, quality markers, codec info, etc.
 */
function cleanTitle(name: string): string {
  return name
    .replace(/\.(mp4|mkv|avi|webm|mov|m4v|wmv|ts)$/i, '')
    .replace(/\b(19|20)\d{2}\b.*$/, '')          // remove year + everything after
    .replace(/[._]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Main scan function. Discovers video files and upserts them into the DB.
 */
export async function scanVideoLibrary(options: VideoScanOptions): Promise<VideoScanResult> {
  const { libraryPath, force = false } = options;
  const result: VideoScanResult = { movies: 0, episodes: 0, skipped: 0, errors: 0 };

  logger.info(`[VideoScanner] Starting scan: ${libraryPath}`);
  const files = walkDir(libraryPath);
  logger.info(`[VideoScanner] Found ${files.length} video files`);

  for (const filePath of files) {
    try {
      const filename  = path.basename(filePath);
      const episodeMatch = EPISODE_PATTERN.exec(filename);

      if (episodeMatch) {
        // ── Series episode ────────────────────────────────────────────────
        const seasonNum  = parseInt(episodeMatch[1] ?? episodeMatch[3], 10);
        const episodeNum = parseInt(episodeMatch[2] ?? episodeMatch[4], 10);

        // Derive series title from parent directory or filename prefix
        const seriesDir  = path.dirname(filePath);
        const seriesName = cleanTitle(path.basename(seriesDir));
        const epTitle    = cleanTitle(filename.replace(EPISODE_PATTERN, '').trim()) || `Episode ${episodeNum}`;

        // Existing episode?
        const existing = await prisma.episode.findUnique({
          where: { filePath },
          select: { id: true },
        });
        if (existing && !force) { result.skipped++; continue; }

        const stat     = fs.statSync(filePath);
        const fileSize = BigInt(stat.size);

        // Upsert series
        const series = await prisma.series.upsert({
          where:  { id: (await prisma.series.findFirst({ where: { title: seriesName }, select: { id: true } }))?.id ?? '' },
          update: { updatedAt: new Date() },
          create: { title: seriesName, sortTitle: seriesName.toLowerCase() },
        });

        // Upsert season
        const season = await prisma.season.upsert({
          where:  { seriesId_number: { seriesId: series.id, number: seasonNum } },
          update: {},
          create: { seriesId: series.id, number: seasonNum },
        });

        // Upsert episode
        await prisma.episode.upsert({
          where:  { filePath },
          update: { title: epTitle, fileSize, number: episodeNum },
          create: { seasonId: season.id, number: episodeNum, title: epTitle, filePath, fileSize },
        });

        result.episodes++;
      } else {
        // ── Standalone movie ──────────────────────────────────────────────
        const existing = await prisma.movie.findUnique({ where: { filePath }, select: { id: true } });
        if (existing && !force) { result.skipped++; continue; }

        const stat     = fs.statSync(filePath);
        const fileSize = BigInt(stat.size);
        const baseName = path.basename(filePath, path.extname(filePath));
        const year     = parseYear(baseName);
        const title    = cleanTitle(baseName);

        await prisma.movie.upsert({
          where:  { filePath },
          update: { title, year, fileSize, updatedAt: new Date() },
          create: { title, sortTitle: title.toLowerCase(), year, filePath, fileSize },
        });

        result.movies++;
      }
    } catch (err) {
      logger.error(`[VideoScanner] Error processing ${filePath}:`, err);
      result.errors++;
    }
  }

  logger.info(
    `[VideoScanner] Done — movies: ${result.movies}, episodes: ${result.episodes}, ` +
    `skipped: ${result.skipped}, errors: ${result.errors}`,
  );

  return result;
}
