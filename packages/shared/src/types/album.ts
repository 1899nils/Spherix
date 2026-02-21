export interface Album {
  id: string;
  title: string;
  year: number | null;
  coverPath: string | null;
  artistId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlbumWithRelations extends Album {
  artist: { id: string; name: string };
  trackCount: number;
}
