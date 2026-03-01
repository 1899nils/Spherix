/**
 * Video Library Scanner
 *
 * Follows Plex naming conventions:
 *   Movies  → /VIDEO_PATH/Movie Title (Year).ext
 *             /VIDEO_PATH/Movie Title (Year)/Movie Title (Year).ext
 *   Series  → /VIDEO_PATH/Show Name/Season 01/Show Name - S01E01 - Title.ext
 *
 * References:
 *   https://support.plex.tv/articles/naming-and-organizing-your-movie-media-files/
 *   https://support.plex.tv/articles/naming-and-organizing-your-tv-show-files/
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { probeVideo } from './ffprobe.js';
import { saveCoverArt, saveFolderCover } from './cover.service.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.m4v', '.mkv', '.webm', '.avi',
  '.mov', '.wmv', '.ts',  '.ogv', '.3gp', '.flv',
]);

/** Season directory patterns: Season 01, Staffel 01, S01, Saison 1 … */
const SEASON_DIR_RE = /^(?:season|staffel|saison|s)\s*(\d{1,3})$/i;

/** Episode filename patterns: S01E02, S01E02E03, 1x02 */
const EPISODE_FILE_RE = /[Ss](\d{1,3})[Ee](\d{1,3})|(\d{1,2})x(\d{2})/;

/** Poster/cover image candidates — ordered by preference */
const POSTER_NAMES = ['poster', 'folder', 'cover', 'fanart', 'banner', 'show'];
const POSTER_EXTS  = ['.jpg', '.jpeg', '.png', '.webp'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function walkVideoFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    logger.warn(`[VideoScanner] Cannot read directory: ${dir}`);
    return results;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...await walkVideoFiles(full));
    } else if (e.isFile() && VIDEO_EXTENSIONS.has(path.extname(e.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

/** Parse year from "Movie Title (2023)" or "Show Name 2023" */
function parseYear(str: string): number | null {
  const m = str.match(/\b(19\d{2}|20\d{2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

/** Strip year, codec tags, quality markers — return clean title */
function cleanName(name: string): string {
  return name
    .replace(/\.\w{2,4}$/, '')               // remove extension
    .replace(/\b(19\d{2}|20\d{2})\b.*/s, '') // strip year and everything after
    .replace(/[._]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Look for a poster image file in the given directory (and optionally also
 * in the parent directory for series/season hierarchy).
 */
async function findPoster(dirs: string[]): Promise<string | null> {
  for (const dir of dirs) {
    for (const name of POSTER_NAMES) {
      for (const ext of POSTER_EXTS) {
        const candidate = path.join(dir, `${name}${ext}`);
        try {
          const data = await fs.readFile(candidate);
          const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
          const url  = await saveCoverArt([{ data: new Uint8Array(data), format: mime }]);
          if (url) return url;
        } catch { /* file not found — try next */ }
      }
    }
  }
  return null;
}

// ─── Main scanner ─────────────────────────────────────────────────────────────

export interface VideoScanProgress {
  phase:    'discovering' | 'scanning' | 'cleanup' | 'done' | 'error';
  total:    number;
  done:     number;
  movies:   number;
  episodes: number;
  skipped:  number;
  errors:   number;
  message?: string;
}

export async function scanVideoLibrary(): Promise<VideoScanProgress> {
  const rootPath = env.videoPath;
  const progress: VideoScanProgress = {
    phase: 'discovering', total: 0, done: 0,
    movies: 0, episodes: 0, skipped: 0, errors: 0,
  };

  if (!fsSync.existsSync(rootPath)) {
    logger.warn(`[VideoScanner] VIDEO_PATH does not exist: ${rootPath}`);
    progress.phase   = 'done';
    progress.message = `VIDEO_PATH (${rootPath}) not found — skipping`;
    return progress;
  }

  logger.info(`[VideoScanner] Scanning ${rootPath}`);
  const allFiles = await walkVideoFiles(rootPath);
  progress.total = allFiles.length;
  progress.phase = 'scanning';
  logger.info(`[VideoScanner] ${allFiles.length} video files found`);

  const scannedPaths = new Set<string>();

  for (const filePath of allFiles) {
    scannedPaths.add(filePath);
    try {
      // ── Determine if episode or movie by directory structure ───────────
      const parts     = filePath.replace(rootPath, '').split(path.sep).filter(Boolean);
      // parts example: ["Breaking Bad", "Season 01", "S01E01 - Pilot.mp4"]
      //           or:  ["Movie Title (2023).mp4"]
      //           or:  ["Movie Title (2023)", "Movie Title (2023).mp4"]

      const filename    = parts[parts.length - 1];
      const parentDir   = parts.length >= 2 ? parts[parts.length - 2] : '';
      const grandParent = parts.length >= 3 ? parts[parts.length - 3] : '';

      const seasonDirMatch  = SEASON_DIR_RE.exec(parentDir);
      const episodeFileMatch = EPISODE_FILE_RE.exec(filename);

      const isEpisode = !!(seasonDirMatch || episodeFileMatch);

      if (isEpisode) {
        // ── Episode ───────────────────────────────────────────────────────
        const existing = await prisma.episode.findUnique({ where: { filePath }, select: { id: true } });
        if (existing) { progress.skipped++; progress.done++; continue; }

        const seasonNum  = parseInt(
          seasonDirMatch?.[1] ??
          episodeFileMatch?.[1] ??
          episodeFileMatch?.[3] ?? '1',
          10,
        );
        const episodeNum = parseInt(
          episodeFileMatch?.[2] ?? episodeFileMatch?.[4] ?? '1',
          10,
        );

        // Series name: grandparent dir (when inside Season XX) or parent dir
        const seriesName = cleanName(seasonDirMatch ? grandParent : parentDir) || 'Unknown Series';
        const epTitle    = cleanName(filename.replace(EPISODE_FILE_RE, '').replace(/^[\s\-–_]+/, '')) ||
                           `Episode ${episodeNum}`;

        const probe      = await probeVideo(filePath);
        const seriesDir  = path.join(rootPath, ...parts.slice(0, seasonDirMatch ? parts.length - 2 : parts.length - 1));
        const seasonDir  = path.dirname(filePath);
        const posterPath = await findPoster([seriesDir, seasonDir]);

        // Upsert series
        let series = await prisma.series.findFirst({ where: { title: seriesName }, select: { id: true } });
        if (!series) {
          series = await prisma.series.create({
            data:   { title: seriesName, sortTitle: seriesName.toLowerCase(), posterPath },
            select: { id: true },
          });
        } else if (posterPath && !series) {
          await prisma.series.update({ where: { id: series.id }, data: { posterPath } });
        }

        // Upsert season
        const season = await prisma.season.upsert({
          where:  { seriesId_number: { seriesId: series.id, number: seasonNum } },
          update: {},
          create: { seriesId: series.id, number: seasonNum },
        });

        // Create episode
        await prisma.episode.create({
          data: {
            seasonId:  season.id,
            number:    episodeNum,
            title:     epTitle,
            filePath,
            fileSize:  probe.fileSize,
            codec:     probe.codec,
            resolution: probe.resolution,
            runtime:   probe.runtime,
          },
        });

        progress.episodes++;
      } else {
        // ── Movie ─────────────────────────────────────────────────────────
        const existing = await prisma.movie.findUnique({ where: { filePath }, select: { id: true } });
        if (existing) { progress.skipped++; progress.done++; continue; }

        const movieDirName = parts.length >= 2 ? parts[parts.length - 2] : '';
        const baseName     = cleanName(movieDirName || filename);
        const title        = baseName || 'Unknown Title';
        const year         = parseYear(movieDirName || filename);
        const probe        = await probeVideo(filePath);
        const movieDir     = path.dirname(filePath);
        const posterPath   = await findPoster([movieDir]) ??
                             await saveFolderCover(filePath);

        await prisma.movie.create({
          data: {
            title,
            sortTitle:   title.toLowerCase(),
            year,
            filePath,
            fileSize:    probe.fileSize,
            codec:       probe.codec,
            resolution:  probe.resolution,
            runtime:     probe.runtime,
            posterPath,
          },
        });

        progress.movies++;
      }
    } catch (err) {
      logger.error(`[VideoScanner] Error: ${filePath}`, err);
      progress.errors++;
    }
    progress.done++;
  }

  // ── Cleanup: mark removed files ───────────────────────────────────────────
  progress.phase = 'cleanup';

  const dbMovies = await prisma.movie.findMany({
    where:  { filePath: { startsWith: rootPath } },
    select: { id: true, filePath: true },
  });
  const orphanMovies = dbMovies.filter(m => !scannedPaths.has(m.filePath)).map(m => m.id);
  if (orphanMovies.length > 0) {
    await prisma.movie.deleteMany({ where: { id: { in: orphanMovies } } });
    logger.info(`[VideoScanner] Removed ${orphanMovies.length} missing movie records`);
  }

  const dbEpisodes = await prisma.episode.findMany({
    where:  { filePath: { startsWith: rootPath } },
    select: { id: true, filePath: true },
  });
  const orphanEpisodes = dbEpisodes.filter(e => !scannedPaths.has(e.filePath)).map(e => e.id);
  if (orphanEpisodes.length > 0) {
    await prisma.episode.deleteMany({ where: { id: { in: orphanEpisodes } } });
    logger.info(`[VideoScanner] Removed ${orphanEpisodes.length} missing episode records`);
  }

  progress.phase   = 'done';
  progress.message =
    `Scan complete — movies: ${progress.movies}, episodes: ${progress.episodes}, ` +
    `skipped: ${progress.skipped}, errors: ${progress.errors}`;
  logger.info(`[VideoScanner] ${progress.message}`);

  return progress;
}
