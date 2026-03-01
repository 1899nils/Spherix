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
