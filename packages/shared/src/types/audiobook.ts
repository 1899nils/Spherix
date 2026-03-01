import type { Genre } from './video.js';

export interface Audiobook {
  id: string;
  title: string;
  sortTitle: string | null;
  author: string | null;
  narrator: string | null;
  year: number | null;
  duration: number | null;
  overview: string | null;
  coverPath: string | null;
  filePath: string | null;
  listenProgress: number | null;
  addedAt: Date;
  updatedAt: Date;
  genres: Genre[];
}

export interface AudiobookChapter {
  id: string;
  title: string;
  number: number;
  audiobookId: string;
  startTime: number;
  endTime: number | null;
  filePath: string | null;
}

export interface AudiobookDetail extends Audiobook {
  chapters: AudiobookChapter[];
}
