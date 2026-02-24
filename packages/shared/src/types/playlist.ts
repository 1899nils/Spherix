import type { TrackWithRelations } from './track';

export interface Playlist {
  id: string;
  name: string;
  coverUrl: string | null;
  userId: string;
  isPublic: boolean;
  isPinned: boolean;
  lastPlayedAt: string | null;
  createdAt: string;
}

export interface PlaylistWithTracks extends Playlist {
  tracks: TrackWithRelations[];
  trackCount: number;
}
