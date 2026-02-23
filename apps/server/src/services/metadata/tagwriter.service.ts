import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import NodeID3 from 'node-id3';
import flac from 'flac-metadata';
import { logger } from '../../config/logger.js';

export interface TagFields {
  title?: string;
  artist?: string;
  album?: string;
  trackNumber?: number;
  discNumber?: number;
  year?: number;
  genre?: string;
  lyrics?: string;
}

/**
 * Write metadata tags back to an audio file.
 * Supports MP3 (ID3v2 via node-id3) and FLAC (Vorbis Comments via flac-metadata).
 * Other formats only update the database (no file tag writing).
 */
export async function writeTags(
  filePath: string,
  tags: TagFields,
): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.mp3':
      writeMp3Tags(filePath, tags);
      break;
    case '.flac':
      await writeFlacTags(filePath, tags);
      break;
    default:
      logger.info(
        `Tag writing not supported for ${ext} files, skipping: ${filePath}`,
      );
  }
}

// ─── MP3 (ID3v2) ───────────────────────────────────────────────────────────

function writeMp3Tags(filePath: string, tags: TagFields): void {
  const id3Tags: NodeID3.WriteTags = {};

  if (tags.title !== undefined) id3Tags.title = tags.title;
  if (tags.artist !== undefined) id3Tags.artist = tags.artist;
  if (tags.album !== undefined) id3Tags.album = tags.album;
  if (tags.year !== undefined) id3Tags.year = String(tags.year);
  if (tags.genre !== undefined) id3Tags.genre = tags.genre;
  if (tags.trackNumber !== undefined) {
    id3Tags.trackNumber = String(tags.trackNumber);
  }
  if (tags.discNumber !== undefined) {
    id3Tags.partOfSet = String(tags.discNumber);
  }
  if (tags.lyrics !== undefined) {
    id3Tags.unsynchronisedLyrics = { language: 'eng', text: tags.lyrics };
  }

  const success = NodeID3.update(id3Tags, filePath);
  if (!success) {
    throw new Error(`Failed to write ID3 tags to ${filePath}`);
  }
  logger.info(`Updated ID3 tags: ${filePath}`);
}

// ─── FLAC (Vorbis Comments) ────────────────────────────────────────────────

function writeFlacTags(
  filePath: string,
  tags: TagFields,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Read existing Vorbis Comments so we can merge with new tags
    const existingComments: string[] = [];
    const newFields = new Map<string, string>();

    if (tags.title !== undefined) newFields.set('TITLE', tags.title);
    if (tags.artist !== undefined) newFields.set('ARTIST', tags.artist);
    if (tags.album !== undefined) newFields.set('ALBUM', tags.album);
    if (tags.year !== undefined) newFields.set('DATE', String(tags.year));
    if (tags.genre !== undefined) newFields.set('GENRE', tags.genre);
    if (tags.trackNumber !== undefined) {
      newFields.set('TRACKNUMBER', String(tags.trackNumber));
    }
    if (tags.discNumber !== undefined) {
      newFields.set('DISCNUMBER', String(tags.discNumber));
    }
    if (tags.lyrics !== undefined) newFields.set('LYRICS', tags.lyrics);

    const overriddenKeys = new Set(
      [...newFields.keys()].map((k) => k.toUpperCase()),
    );

    // Write to a temp file, then rename (atomic-ish)
    const tmpPath = path.join(
      os.tmpdir(),
      `flac-${Date.now()}-${path.basename(filePath)}`,
    );

    const reader = fs.createReadStream(filePath);
    const writer = fs.createWriteStream(tmpPath);
    const processor = new flac.Processor({ parseMetaDataBlocks: true });

    processor.on('preprocess', function (this: flac.Processor, mdb: flac.MetaDataBlock) {
      // Collect existing comments that we are NOT overriding
      if (mdb.type === flac.Processor.MDB_TYPE_VORBIS_COMMENT && mdb.hasData) {
        const parsed = parseVorbisCommentBlock(mdb.data);
        for (const comment of parsed.comments) {
          const eqIdx = comment.indexOf('=');
          if (eqIdx > 0) {
            const key = comment.substring(0, eqIdx).toUpperCase();
            if (!overriddenKeys.has(key)) {
              existingComments.push(comment);
            }
          }
        }
        mdb.remove = true;
      }

      // Insert our new block right before the last metadata block
      if (mdb.isLast) {
        mdb.isLast = false;
        const allComments = [
          ...existingComments,
          ...[...newFields.entries()].map(([k, v]) => `${k}=${v}`),
        ];
        const newBlock =
          flac.data.MetaDataBlockVorbisComment.create(
            true, // isLast
            'MusicServer/1.0',
            allComments,
          );
        this.push(newBlock.publish());
      }
    });

    writer.on('finish', () => {
      // Replace original with new file
      try {
        fs.copyFileSync(tmpPath, filePath);
        fs.unlinkSync(tmpPath);
        logger.info(`Updated FLAC Vorbis Comments: ${filePath}`);
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    reader.on('error', (err) => {
      cleanup(tmpPath);
      reject(err);
    });
    writer.on('error', (err) => {
      cleanup(tmpPath);
      reject(err);
    });
    processor.on('error', (err: unknown) => {
      cleanup(tmpPath);
      reject(err);
    });

    reader.pipe(processor).pipe(writer);
  });
}

/**
 * Parse a raw Vorbis Comment metadata block to extract the comment strings.
 * Layout: [4-byte vendor length][vendor string][4-byte count][comments...]
 */
function parseVorbisCommentBlock(
  data: Buffer,
): { vendor: string; comments: string[] } {
  let offset = 0;
  const vendorLen = data.readUInt32LE(offset);
  offset += 4;
  const vendor = data.subarray(offset, offset + vendorLen).toString('utf8');
  offset += vendorLen;
  const count = data.readUInt32LE(offset);
  offset += 4;
  const comments: string[] = [];
  for (let i = 0; i < count; i++) {
    const len = data.readUInt32LE(offset);
    offset += 4;
    comments.push(data.subarray(offset, offset + len).toString('utf8'));
    offset += len;
  }
  return { vendor, comments };
}

function cleanup(tmpPath: string): void {
  try {
    fs.unlinkSync(tmpPath);
  } catch {
    // ignore
  }
}
