export interface Artist {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArtistWithRelations extends Artist {
  albumCount: number;
  trackCount: number;
}
