import type { TrackWithRelations } from './track.js';

export interface Playlist {
  id: string;
  name: string;
  coverUrl: string | null;
  userId: string;
  isPublic: boolean;
  isPinned: boolean;
  lastPlayedAt: string | null;
  createdAt: string;
  trackCount: number;
}

export interface PlaylistTrack extends TrackWithRelations {
  addedAt: string;
}

export interface PlaylistWithTracks extends Playlist {
  tracks: PlaylistTrack[];
  trackCount: number;
}
