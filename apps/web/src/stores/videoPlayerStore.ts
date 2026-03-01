import { create } from 'zustand';

export interface ActiveVideo {
  id: string;
  title: string;
  type: 'movie' | 'episode';
  streamUrl: string;
  posterUrl?: string | null;
  seriesTitle?: string;
  runtime?: number | null; // minutes
}

interface VideoPlayerState {
  activeVideo: ActiveVideo | null;
  isPlaying: boolean;
  setActiveVideo: (video: ActiveVideo | null) => void;
  setIsPlaying: (playing: boolean) => void;
  stop: () => void;
}

export const useVideoPlayerStore = create<VideoPlayerState>((set) => ({
  activeVideo: null,
  isPlaying: false,
  setActiveVideo: (video) => set({ activeVideo: video, isPlaying: !!video }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  stop: () => set({ activeVideo: null, isPlaying: false }),
}));
