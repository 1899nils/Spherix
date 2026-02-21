export interface Playlist {
  id: string;
  name: string;
  description: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistWithTracks extends Playlist {
  tracks: { id: string; title: string; duration: number }[];
  trackCount: number;
}
