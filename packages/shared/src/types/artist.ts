export interface Artist {
  id: string;
  name: string;
  sortName: string | null;
  biography: string | null;
  imageUrl: string | null;
  musicbrainzId: string | null;
  externalIds: Record<string, string> | null;
}

export interface ArtistWithRelations extends Artist {
  albumCount: number;
  trackCount: number;
}
