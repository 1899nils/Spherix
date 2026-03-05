export interface Genre {
  id: string;
  name: string;
}

export interface Movie {
  id: string;
  title: string;
  sortTitle: string | null;
  year: number | null;
  runtime: number | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  tmdbId: number | null;
  filePath: string;
  fileSize: bigint | null;
  codec: string | null;
  resolution: string | null;
  watched: boolean;
  watchProgress: number | null;
  addedAt: Date;
  updatedAt: Date;
  genres: Genre[];
}

export interface Series {
  id: string;
  title: string;
  sortTitle: string | null;
  year: number | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  tmdbId: number | null;
  addedAt: Date;
  updatedAt: Date;
  genres: Genre[];
  seasons?: Season[];
}

export interface Season {
  id: string;
  number: number;
  seriesId: string;
  episodes?: Episode[];
}

export interface Episode {
  id: string;
  title: string;
  number: number;
  seasonId: string;
  overview: string | null;
  runtime: number | null;
  filePath: string;
  fileSize: bigint | null;
  codec: string | null;
  resolution: string | null;
  thumbnailPath: string | null;
  watched: boolean;
  watchProgress: number | null;
  addedAt: Date;
}

export interface SeriesDetail extends Series {
  seasons: (Season & { episodes: Episode[] })[];
}

// ─── TMDb Search Types ────────────────────────────────────────────────────────

export interface TmdbSearchResult {
  tmdbId: number;
  title: string;
  originalTitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  rating: number;
  genreIds: number[];
  year: number | null;
  mediaType: 'movie' | 'tv';
}

export interface TmdbResult {
  tmdbId: number;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  rating: number;
  genreIds: number[];
  year: number | null;
}

// ─── Video Scan Progress ──────────────────────────────────────────────────────

export interface VideoScanProgress {
  phase: 'discovering' | 'scanning' | 'cleanup' | 'done' | 'error';
  total: number;
  done: number;
  movies: number;
  episodes: number;
  skipped: number;
  errors: number;
  message?: string;
}

// ─── Streaming Types ──────────────────────────────────────────────────────────

export interface MediaStreamInfo {
  id: string;
  type: 'movie' | 'episode';
  streamUrl: string;
  directPlay: boolean;
  directPlayReason?: string;
  mediaInfo: {
    container: string;
    duration: number;
    video: {
      codec: string;
      width: number;
      height: number;
      fps: number;
      bitrate: number;
    } | null;
    audio: {
      index: number;
      codec: string;
      language?: string;
      channels: number;
      default: boolean;
    }[];
    subtitles: {
      index: number;
      codec: string;
      language?: string;
      default: boolean;
      forced: boolean;
    }[];
  };
  clientCapabilities: {
    videoCodecs: string[];
    audioCodecs: string[];
    maxResolution: { width: number; height: number };
    maxBitrate: number;
    containerFormats: string[];
  };
}

export interface TranscodeStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
}
