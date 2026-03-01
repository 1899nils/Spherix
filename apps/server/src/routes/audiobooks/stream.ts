/**
 * Audiobook streaming — re-exports the generic streamFile utility
 * with audio-specific MIME types pre-filled.
 */
import type { Request, Response } from 'express';
import { streamFile } from '../video/stream.js';

export const AUDIO_MIME: Record<string, string> = {
  '.mp3':  'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a':  'audio/mp4',
  '.m4b':  'audio/mp4',   // audiobook container
  '.aac':  'audio/aac',
  '.ogg':  'audio/ogg',
  '.opus': 'audio/opus',
  '.wav':  'audio/wav',
  '.aiff': 'audio/aiff',
  '.wma':  'audio/x-ms-wma',
};

export function streamAudio(req: Request, res: Response, filePath: string): void {
  streamFile(req, res, filePath, AUDIO_MIME);
}
