export interface Track {
  id: string;
  title: string;
  albumId: string | null;
  artistId: string;
  trackNumber: number;
  discNumber: number;
  duration: number;
  filePath: string;
  fileSize: string; // BigInt serialized as string
  format: string;
  bitrate: number | null;
  sampleRate: number | null;
  channels: number | null;
  musicbrainzId: string | null;
  lyrics: string | null;
  missing: boolean;
  createdAt: string;
}

export interface TrackWithRelations extends Track {
  artist: { id: string; name: string };
  album: { id: string; title: string; coverUrl: string | null } | null;
}
