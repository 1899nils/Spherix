import { create } from 'zustand';
import { Howl } from 'howler';
import { usePlayerStore } from './playerStore';

export interface AudiobookChapterItem {
  id: string;
  number: number;
  title: string;
  startTime: number;
  endTime: number | null;
  filePath: string | null;
}

export interface PlayableAudiobook {
  id: string;
  title: string;
  author: string | null;
  coverPath: string | null;
  filePath: string | null; // null = multi-file book
  duration: number | null;
  chapters: AudiobookChapterItem[];
}

interface AudiobookPlayerState {
  currentBook: PlayableAudiobook | null;
  chapterIndex: number;
  isPlaying: boolean;
  seek: number;
  duration: number;
  speed: number;
  volume: number;
  sleepRemaining: number | null; // seconds remaining, null = off

  _howl: Howl | null;
  _seekInterval: ReturnType<typeof setInterval> | null;
  _sleepInterval: ReturnType<typeof setInterval> | null;

  playBook: (book: PlayableAudiobook, chapterIndex?: number, startAt?: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekTo: (seconds: number) => void;
  prevChapter: () => void;
  nextChapter: () => void;
  setSpeed: (speed: number) => void;
  setVolume: (v: number) => void;
  setSleepTimer: (minutes: number | null) => void;
  stop: () => void;
}

function clearIntervals(state: Pick<AudiobookPlayerState, '_seekInterval' | '_sleepInterval'>) {
  if (state._seekInterval) clearInterval(state._seekInterval);
  if (state._sleepInterval) clearInterval(state._sleepInterval);
}

export const useAudiobookPlayerStore = create<AudiobookPlayerState>((set, get) => ({
  currentBook: null,
  chapterIndex: 0,
  isPlaying: false,
  seek: 0,
  duration: 0,
  speed: 1.0,
  volume: 0.8,
  sleepRemaining: null,

  _howl: null,
  _seekInterval: null,
  _sleepInterval: null,

  playBook: (book, chapterIndex = 0, startAt = 0) => {
    const state = get();

    // Pause music player to avoid overlap
    usePlayerStore.getState().pause();

    if (state._howl) state._howl.unload();
    clearIntervals(state);

    const chapter = book.chapters[chapterIndex] ?? null;
    const isMultiFile = !book.filePath;

    let src: string;
    let seekToOnPlay = startAt;

    if (isMultiFile && chapter?.filePath) {
      src = `/api/audiobooks/chapters/${chapter.id}/stream`;
    } else if (book.filePath) {
      src = `/api/audiobooks/${book.id}/stream`;
      seekToOnPlay = (chapter?.startTime ?? 0) + startAt;
    } else {
      return;
    }

    const { speed, volume } = state;
    let seekApplied = false;

    const howl = new Howl({
      src: [src],
      html5: true,
      rate: speed,
      volume,
      onplay: () => {
        if (!seekApplied && seekToOnPlay > 0) {
          seekApplied = true;
          howl.seek(seekToOnPlay);
        }

        const chDuration = isMultiFile
          ? howl.duration()
          : chapter?.endTime != null
            ? chapter.endTime - (chapter?.startTime ?? 0)
            : howl.duration();

        set({ isPlaying: true, duration: chDuration });

        const { _seekInterval: stale } = get();
        if (stale) clearInterval(stale);

        const interval = setInterval(() => {
          if (!howl.playing()) return;
          const raw = howl.seek() as number;
          const chSeek = isMultiFile ? raw : raw - (chapter?.startTime ?? 0);
          set({ seek: Math.max(0, chSeek) });

          // Detect chapter end for single-file books
          if (!isMultiFile && chapter?.endTime != null && raw >= chapter.endTime - 0.5) {
            howl.stop();
          }
        }, 500);

        set({ _seekInterval: interval });
      },
      onpause: () => {
        const { _seekInterval } = get();
        if (_seekInterval) clearInterval(_seekInterval);
        set({ isPlaying: false, _seekInterval: null });
      },
      onstop: () => {
        const { _seekInterval } = get();
        if (_seekInterval) clearInterval(_seekInterval);
        set({ isPlaying: false, _seekInterval: null });
      },
      onend: () => {
        const { _seekInterval } = get();
        if (_seekInterval) clearInterval(_seekInterval);
        set({ isPlaying: false, _seekInterval: null });

        const s = get();
        const nextIdx = chapterIndex + 1;
        if (s.currentBook && nextIdx < s.currentBook.chapters.length) {
          s.playBook(s.currentBook, nextIdx, 0);
        }
      },
    });

    set({
      currentBook: book,
      chapterIndex,
      _howl: howl,
      seek: 0,
      _seekInterval: null,
    });

    howl.play();
  },

  play: () => {
    const { _howl } = get();
    if (_howl) _howl.play();
  },

  pause: () => {
    const { _howl } = get();
    if (_howl) _howl.pause();
  },

  togglePlay: () => {
    const { isPlaying } = get();
    if (isPlaying) get().pause();
    else get().play();
  },

  seekTo: (seconds) => {
    const { _howl, currentBook, chapterIndex } = get();
    if (!_howl) return;
    const chapter = currentBook?.chapters[chapterIndex];
    const isMultiFile = !currentBook?.filePath;
    const rawSeek = isMultiFile ? seconds : (chapter?.startTime ?? 0) + seconds;
    _howl.seek(rawSeek);
    set({ seek: seconds });
  },

  prevChapter: () => {
    const { currentBook, chapterIndex } = get();
    if (!currentBook) return;
    get().playBook(currentBook, Math.max(0, chapterIndex - 1), 0);
  },

  nextChapter: () => {
    const { currentBook, chapterIndex } = get();
    if (!currentBook) return;
    get().playBook(currentBook, Math.min(currentBook.chapters.length - 1, chapterIndex + 1), 0);
  },

  setSpeed: (speed) => {
    const { _howl } = get();
    set({ speed });
    if (_howl) _howl.rate(speed);
  },

  setVolume: (v) => {
    const { _howl } = get();
    set({ volume: v });
    if (_howl) _howl.volume(v);
  },

  setSleepTimer: (minutes) => {
    const { _sleepInterval } = get();
    if (_sleepInterval) clearInterval(_sleepInterval);

    if (minutes === null) {
      set({ sleepRemaining: null, _sleepInterval: null });
      return;
    }

    set({ sleepRemaining: minutes * 60 });

    const interval = setInterval(() => {
      const { sleepRemaining } = get();
      if (sleepRemaining === null) { clearInterval(interval); return; }
      const next = sleepRemaining - 1;
      if (next <= 0) {
        clearInterval(interval);
        set({ sleepRemaining: null, _sleepInterval: null });
        get().pause();
      } else {
        set({ sleepRemaining: next });
      }
    }, 1000);

    set({ _sleepInterval: interval });
  },

  stop: () => {
    const state = get();
    if (state._howl) state._howl.unload();
    clearIntervals(state);
    set({
      currentBook: null,
      chapterIndex: 0,
      isPlaying: false,
      seek: 0,
      duration: 0,
      _howl: null,
      _seekInterval: null,
      _sleepInterval: null,
      sleepRemaining: null,
    });
  },
}));
