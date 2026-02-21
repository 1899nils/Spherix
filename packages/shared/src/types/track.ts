export interface Track {
  id: string;
  title: string;
  duration: number;
  trackNumber: number;
  discNumber: number;
  filePath: string;
  mimeType: string;
  bitrate: number | null;
  sampleRate: number | null;
  albumId: string | null;
  artistId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrackWithRelations extends Track {
  artist: { id: string; name: string };
  album: { id: string; title: string; coverPath: string | null } | null;
}
