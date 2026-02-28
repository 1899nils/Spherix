import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { extractMetadata } from './metadata.service.js';
import { scannerEvents, type ScanProgress } from './scanner.events.js';
import { autoMatchAlbum } from '../musicbrainz/auto-match.service.js';

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.ogg', '.opus', '.m4a', '.aac', '.wav', '.aiff',
]);

/**
 * Recursively discovers all audio files in a directory.
 */
async function discoverAudioFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      logger.warn(`Cannot read directory: ${dir}`, { error });
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (AUDIO_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  await walk(dirPath);
  return files;
}

/**
 * Finds or creates an artist by name. Returns the artist ID.
 */
async function upsertArtist(
  name: string,
  musicbrainzId: string | null,
): Promise<string> {
  // Try to find by MusicBrainz ID first if available
  if (musicbrainzId) {
    const existing = await prisma.artist.findUnique({
      where: { musicbrainzId },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  // Find by exact name match or create
  const existing = await prisma.artist.findFirst({
    where: { name },
    select: { id: true },
  });
  if (existing) return existing.id;

  const artist = await prisma.artist.create({
    data: {
      name,
      sortName: buildSortName(name),
      ...(musicbrainzId ? { musicbrainzId } : {}),
    },
    select: { id: true },
  });
  return artist.id;
}

/**
 * Builds a sort name (e.g. "The Beatles" -> "Beatles, The").
 */
function buildSortName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.startsWith('the ')) {
    return `${name.slice(4)}, ${name.slice(0, 3)}`;
  }
  return name;
}

/**
 * Finds or creates an album by title + artist. Returns the album ID.
 */
async function upsertAlbum(
  title: string,
  artistId: string,
  year: number | null,
  genre: string | null,
  coverUrl: string | null,
  musicbrainzId: string | null,
): Promise<string> {
  // Try to find by MusicBrainz ID first
  if (musicbrainzId) {
    const existing = await prisma.album.findUnique({
      where: { musicbrainzId },
      select: { id: true },
    });
    if (existing) {
      await prisma.album.update({
        where: { id: existing.id },
        data: {
          ...(coverUrl ? { coverUrl } : {}),
          ...(year ? { year } : {}),
          ...(genre ? { genre } : {}),
        },
      });
      return existing.id;
    }
  }

  // Find by title + artist
  const existing = await prisma.album.findFirst({
    where: { title, artistId },
    select: { id: true },
  });
  if (existing) {
    await prisma.album.update({
      where: { id: existing.id },
      data: {
        ...(coverUrl ? { coverUrl } : {}),
        ...(year ? { year } : {}),
        ...(genre ? { genre } : {}),
      },
    });
    return existing.id;
  }

  const album = await prisma.album.create({
    data: {
      title,
      artistId,
      year,
      genre,
      coverUrl,
      ...(musicbrainzId ? { musicbrainzId } : {}),
    },
    select: { id: true },
  });
  return album.id;
}

/**
 * Scans a library directory and syncs tracks to the database.
 */
export async function scanLibrary(libraryId: string): Promise<ScanProgress> {
  const library = await prisma.library.findUnique({
    where: { id: libraryId },
  });

  if (!library) {
    throw new Error(`Library not found: ${libraryId}`);
  }

  const progress: ScanProgress = {
    libraryId,
    phase: 'discovering',
    totalFiles: 0,
    processedFiles: 0,
    newTracks: 0,
    updatedTracks: 0,
    removedTracks: 0,
    errors: 0,
  };

  scannerEvents.emitProgress(progress);
  logger.info(`Starting scan for library "${library.name}" at ${library.path}`);

  // Phase 1: Discover audio files
  const audioFiles = await discoverAudioFiles(library.path);
  progress.totalFiles = audioFiles.length;
  progress.phase = 'scanning';
  scannerEvents.emitProgress(progress);
  logger.info(`Discovered ${audioFiles.length} audio files`);

  // Phase 2: Process each file
  const scannedFilePaths = new Set<string>();

  for (const filePath of audioFiles) {
    try {
      progress.currentFile = filePath;
      scannerEvents.emitProgress(progress);

      const meta = await extractMetadata(filePath);
      scannedFilePaths.add(filePath);

      // Upsert artist
      const artistId = await upsertArtist(
        meta.artistName,
        meta.musicbrainzArtistId,
      );

      // Upsert album if present
      let albumId: string | null = null;
      if (meta.albumTitle) {
        albumId = await upsertAlbum(
          meta.albumTitle,
          artistId,
          meta.year,
          meta.genre,
          meta.coverUrl,
          meta.musicbrainzAlbumId,
        );
      }

      // Upsert track by filePath
      const existingTrack = await prisma.track.findUnique({
        where: { filePath },
        select: { id: true },
      });

      if (existingTrack) {
        await prisma.track.update({
          where: { id: existingTrack.id },
          data: {
            title: meta.title,
            artistId,
            albumId,
            trackNumber: meta.trackNumber,
            discNumber: meta.discNumber,
            duration: meta.duration,
            fileSize: meta.fileSize,
            format: meta.format,
            bitrate: meta.bitrate,
            sampleRate: meta.sampleRate,
            channels: meta.channels,
            // Only overwrite musicbrainzId if the file has one — never reset an auto-matched ID to null
            ...(meta.musicbrainzTrackId ? { musicbrainzId: meta.musicbrainzTrackId } : {}),
            missing: false,
          },
        });
        progress.updatedTracks++;
      } else {
        await prisma.track.create({
          data: {
            title: meta.title,
            artistId,
            albumId,
            trackNumber: meta.trackNumber,
            discNumber: meta.discNumber,
            duration: meta.duration,
            filePath,
            fileSize: meta.fileSize,
            format: meta.format,
            bitrate: meta.bitrate,
            sampleRate: meta.sampleRate,
            channels: meta.channels,
            musicbrainzId: meta.musicbrainzTrackId,
          },
        });
        progress.newTracks++;
      }
    } catch (error) {
      progress.errors++;
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Error processing file: ${filePath}`, {
        error: err.message,
        stack: err.stack,
        code: (error as NodeJS.ErrnoException).code,
      });
      scannerEvents.emitError(err, filePath);
      // Continue with next file — do not abort the scan
    }

    progress.processedFiles++;
    scannerEvents.emitProgress(progress);
  }

  // Phase 3: Mark missing tracks
  progress.phase = 'cleanup';
  progress.currentFile = undefined;
  scannerEvents.emitProgress(progress);

  // Find tracks whose filePath starts with the library path but weren't seen
  const libraryTracks = await prisma.track.findMany({
    where: {
      filePath: { startsWith: library.path },
      missing: false,
    },
    select: { id: true, filePath: true },
  });

  const missingIds = libraryTracks
    .filter((t: { id: string; filePath: string }) => !scannedFilePaths.has(t.filePath))
    .map((t: { id: string; filePath: string }) => t.id);

  if (missingIds.length > 0) {
    await prisma.track.updateMany({
      where: { id: { in: missingIds } },
      data: { missing: true },
    });
    progress.removedTracks = missingIds.length;
    logger.info(`Marked ${missingIds.length} tracks as missing`);
  }

  // Phase 4: Auto-match albums to MusicBrainz (≥98% confidence)
  progress.phase = 'matching';
  scannerEvents.emitProgress(progress);

  const albumsToMatch = await prisma.album.findMany({
    where: {
      OR: [
        // Albums not yet linked to MusicBrainz → attempt full auto-match
        { musicbrainzId: null },
        // Albums already linked but missing cover art → retry cover download
        { musicbrainzId: { not: null }, coverUrl: null },
      ],
      tracks: { some: { filePath: { startsWith: library.path }, missing: false } },
    },
    select: { id: true, title: true },
  });

  progress.totalAlbums = albumsToMatch.length;
  progress.matchedAlbums = 0;
  progress.autoLinkedAlbums = 0;
  scannerEvents.emitProgress(progress);
  logger.info(`Auto-matching ${albumsToMatch.length} albums against MusicBrainz (threshold: 98%)`);

  for (const album of albumsToMatch) {
    try {
      const result = await autoMatchAlbum(album.id);
      if (result.matched) {
        progress.autoLinkedAlbums!++;
      }
    } catch (err) {
      logger.warn(`Auto-match failed for album "${album.title}"`, { error: String(err) });
    }
    progress.matchedAlbums!++;
    scannerEvents.emitProgress(progress);
  }

  logger.info(`Auto-matching complete: ${progress.autoLinkedAlbums} of ${albumsToMatch.length} albums linked`);

  // Update library lastScannedAt
  await prisma.library.update({
    where: { id: libraryId },
    data: { lastScannedAt: new Date() },
  });

  progress.phase = 'done';
  progress.message = `Scan complete: ${progress.newTracks} new, ${progress.updatedTracks} updated, ${progress.removedTracks} missing, ${progress.errors} errors, ${progress.autoLinkedAlbums ?? 0} auto-linked to MusicBrainz`;
  scannerEvents.emitProgress(progress);
  logger.info(progress.message);

  return progress;
}
