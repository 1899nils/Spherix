export interface Playlist {
  id: string;
  name: string;
  userId: string;
  isPublic: boolean;
  isPinned: boolean;
  lastPlayedAt: string | null;
  createdAt: string;
}

import type { TrackWithRelations } from './track';

export interface PlaylistWithTracks extends Playlist {
  tracks: TrackWithRelations[];
  trackCount: number;
}
