import { EventEmitter } from 'node:events';

export interface ScanProgress {
  libraryId: string;
  phase: 'discovering' | 'scanning' | 'cleanup' | 'done' | 'error';
  totalFiles: number;
  processedFiles: number;
  currentFile?: string;
  newTracks: number;
  updatedTracks: number;
  removedTracks: number;
  errors: number;
  message?: string;
}

export interface ScannerEvents {
  progress: (progress: ScanProgress) => void;
  error: (error: Error, filePath?: string) => void;
}

class ScannerEventEmitter extends EventEmitter {
  emitProgress(progress: ScanProgress): void {
    this.emit('progress', progress);
  }

  emitError(error: Error, filePath?: string): void {
    this.emit('error', error, filePath);
  }
}

export const scannerEvents = new ScannerEventEmitter();
