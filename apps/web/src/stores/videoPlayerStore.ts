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
  isMinimized: boolean;
  currentTime: number;
  duration: number;
  setActiveVideo: (video: ActiveVideo | null) => void;
  setIsPlaying: (playing: boolean) => void;
  minimize: () => void;
  maximize: () => void;
  updateProgress: (time: number, duration: number) => void;
  stop: () => void;
}

export const useVideoPlayerStore = create<VideoPlayerState>((set) => ({
  activeVideo: null,
  isPlaying: false,
  isMinimized: false,
  currentTime: 0,
  duration: 0,
  setActiveVideo: (video) => set({ activeVideo: video, isPlaying: !!video, isMinimized: false }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  minimize: () => set({ isMinimized: true }),
  maximize: () => set({ isMinimized: false }),
  updateProgress: (time, dur) => set({ currentTime: time, duration: dur }),
  stop: () => set({ activeVideo: null, isPlaying: false, isMinimized: false }),
}));
