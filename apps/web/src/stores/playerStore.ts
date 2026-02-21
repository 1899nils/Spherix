import { create } from 'zustand';
import { Howl } from 'howler';
import type { TrackWithRelations } from '@musicserver/shared';

export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerState {
  // Current track
  currentTrack: TrackWithRelations | null;
  queue: TrackWithRelations[];
  queueIndex: number;

  // Playback state
  isPlaying: boolean;
  duration: number;
  seek: number;
  volume: number;
  isMuted: boolean;
  isShuffled: boolean;
  repeatMode: RepeatMode;

  // Internal
  _howl: Howl | null;
  _seekInterval: ReturnType<typeof setInterval> | null;

  // Actions
  playTrack: (track: TrackWithRelations, queue?: TrackWithRelations[]) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setQueue: (tracks: TrackWithRelations[], startIndex?: number) => void;
  clearQueue: () => void;
}

function stopSeekUpdates(state: PlayerState) {
  if (state._seekInterval) {
    clearInterval(state._seekInterval);
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: -1,

  isPlaying: false,
  duration: 0,
  seek: 0,
  volume: 0.7,
  isMuted: false,
  isShuffled: false,
  repeatMode: 'off',

  _howl: null,
  _seekInterval: null,

  playTrack: (track, queue) => {
    const state = get();

    // Clean up previous howl
    if (state._howl) {
      state._howl.unload();
    }
    stopSeekUpdates(state);

    const newQueue = queue || state.queue;
    const newIndex = queue
      ? queue.findIndex((t) => t.id === track.id)
      : state.queue.findIndex((t) => t.id === track.id);

    const howl = new Howl({
      src: [`/api/tracks/${track.id}/stream`],
      html5: true,
      volume: state.isMuted ? 0 : state.volume,
      onplay: () => {
        set({ isPlaying: true, duration: howl.duration() });

        // Update seek position periodically
        const interval = setInterval(() => {
          if (howl.playing()) {
            set({ seek: howl.seek() as number });
          }
        }, 250);
        set({ _seekInterval: interval });
      },
      onpause: () => set({ isPlaying: false }),
      onstop: () => set({ isPlaying: false }),
      onend: () => {
        stopSeekUpdates(get());
        set({ isPlaying: false, seek: 0 });
        // Auto-advance
        const s = get();
        if (s.repeatMode === 'one') {
          s.playTrack(track, newQueue);
        } else {
          s.next();
        }
      },
      onload: () => {
        set({ duration: howl.duration() });
      },
    });

    set({
      currentTrack: track,
      queue: newQueue,
      queueIndex: newIndex >= 0 ? newIndex : 0,
      _howl: howl,
      seek: 0,
    });

    howl.play();
  },

  play: () => {
    const { _howl, currentTrack } = get();
    if (_howl) {
      _howl.play();
    } else if (currentTrack) {
      get().playTrack(currentTrack);
    }
  },

  pause: () => {
    const { _howl } = get();
    if (_howl) {
      _howl.pause();
      stopSeekUpdates(get());
    }
  },

  togglePlay: () => {
    const { isPlaying } = get();
    if (isPlaying) {
      get().pause();
    } else {
      get().play();
    }
  },

  next: () => {
    const { queue, queueIndex, repeatMode, isShuffled } = get();
    if (queue.length === 0) return;

    let nextIndex: number;
    if (isShuffled) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else {
      nextIndex = queueIndex + 1;
      if (nextIndex >= queue.length) {
        if (repeatMode === 'all') {
          nextIndex = 0;
        } else {
          return; // End of queue
        }
      }
    }

    get().playTrack(queue[nextIndex], queue);
  },

  prev: () => {
    const { queue, queueIndex, seek, isShuffled } = get();
    if (queue.length === 0) return;

    // If past 3 seconds, restart current track
    if (seek > 3) {
      get().seekTo(0);
      return;
    }

    let prevIndex: number;
    if (isShuffled) {
      prevIndex = Math.floor(Math.random() * queue.length);
    } else {
      prevIndex = queueIndex - 1;
      if (prevIndex < 0) prevIndex = queue.length - 1;
    }

    get().playTrack(queue[prevIndex], queue);
  },

  seekTo: (seconds) => {
    const { _howl } = get();
    if (_howl) {
      _howl.seek(seconds);
      set({ seek: seconds });
    }
  },

  setVolume: (volume) => {
    const { _howl } = get();
    set({ volume, isMuted: false });
    if (_howl) {
      _howl.volume(volume);
    }
  },

  toggleMute: () => {
    const { _howl, isMuted, volume } = get();
    const newMuted = !isMuted;
    set({ isMuted: newMuted });
    if (_howl) {
      _howl.volume(newMuted ? 0 : volume);
    }
  },

  toggleShuffle: () => {
    set((s) => ({ isShuffled: !s.isShuffled }));
  },

  cycleRepeat: () => {
    set((s) => {
      const modes: RepeatMode[] = ['off', 'all', 'one'];
      const idx = modes.indexOf(s.repeatMode);
      return { repeatMode: modes[(idx + 1) % modes.length] };
    });
  },

  setQueue: (tracks, startIndex = 0) => {
    set({ queue: tracks, queueIndex: startIndex });
    if (tracks.length > 0) {
      get().playTrack(tracks[startIndex], tracks);
    }
  },

  clearQueue: () => {
    const state = get();
    if (state._howl) {
      state._howl.unload();
    }
    stopSeekUpdates(state);
    set({
      queue: [],
      queueIndex: -1,
      currentTrack: null,
      isPlaying: false,
      seek: 0,
      duration: 0,
      _howl: null,
    });
  },
}));
