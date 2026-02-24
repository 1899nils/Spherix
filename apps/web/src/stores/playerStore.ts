import { create } from 'zustand';
import { Howl } from 'howler';
import type { TrackWithRelations } from '@musicserver/shared';

export type RepeatMode = 'off' | 'all' | 'one';

export interface RadioStation {
  id: string;
  name: string;
  url: string;
  favicon?: string;
  isRadio: true;
}

interface PlayerState {
  // Current track or radio
  currentTrack: TrackWithRelations | RadioStation | null;
  queue: (TrackWithRelations | RadioStation)[];
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
  playStream: (station: RadioStation) => void;
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
  setQueue: (tracks: (TrackWithRelations | RadioStation)[], startIndex?: number) => void;
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
    const newIndex = newQueue.findIndex((t) => 'id' in t && t.id === track.id);

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
          s.playTrack(track, newQueue as TrackWithRelations[]);
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

  playStream: (station) => {
    const state = get();

    if (state._howl) {
      state._howl.unload();
    }
    stopSeekUpdates(state);

    const howl = new Howl({
      src: [station.url],
      html5: true,
      format: ['mp3', 'aac', 'ogg'],
      volume: state.isMuted ? 0 : state.volume,
      onplay: () => set({ isPlaying: true, duration: 0, seek: 0 }),
      onpause: () => set({ isPlaying: false }),
      onstop: () => set({ isPlaying: false }),
      onend: () => set({ isPlaying: false }),
    });

    set({
      currentTrack: station,
      queue: [station],
      queueIndex: 0,
      _howl: howl,
      seek: 0,
      duration: 0,
    });

    howl.play();
  },

  play: () => {
    const { _howl, currentTrack } = get();
    if (_howl) {
      _howl.play();
    } else if (currentTrack) {
      if ('isRadio' in currentTrack) {
        get().playStream(currentTrack);
      } else {
        get().playTrack(currentTrack);
      }
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
    if (queue.length <= 1) return;

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

    const nextItem = queue[nextIndex];
    if ('isRadio' in nextItem) {
      get().playStream(nextItem);
    } else {
      get().playTrack(nextItem, queue as TrackWithRelations[]);
    }
  },

  prev: () => {
    const { queue, queueIndex, seek, isShuffled } = get();
    if (queue.length <= 1) return;

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

    const prevItem = queue[prevIndex];
    if ('isRadio' in prevItem) {
      get().playStream(prevItem);
    } else {
      get().playTrack(prevItem, queue as TrackWithRelations[]);
    }
  },

  seekTo: (seconds) => {
    const { _howl, currentTrack } = get();
    // Cannot seek in live radio streams
    if (currentTrack && 'isRadio' in currentTrack) return;
    
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
      const item = tracks[startIndex];
      if ('isRadio' in item) {
        get().playStream(item);
      } else {
        get().playTrack(item, tracks as TrackWithRelations[]);
      }
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

