export interface Album {
  id: string;
  title: string;
  artistId: string;
  year: number | null;
  releaseDate: string | null;
  genre: string | null;
  coverUrl: string | null;
  musicbrainzId: string | null;
  totalTracks: number | null;
  totalDiscs: number | null;
  label: string | null;
  country: string | null;
  createdAt: string;
}

export interface AlbumWithRelations extends Album {
  artist: { id: string; name: string };
  trackCount: number;
}

export interface AlbumDetail extends AlbumWithRelations {
  tracks: import('./track').TrackWithRelations[];
}
