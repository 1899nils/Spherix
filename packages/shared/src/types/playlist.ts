export interface Playlist {
  id: string;
  name: string;
  userId: string;
  isPublic: boolean;
  createdAt: string;
}

export interface PlaylistWithTracks extends Playlist {
  tracks: { id: string; title: string; duration: number }[];
  trackCount: number;
}
