import { create } from 'zustand';

interface UIStore {
  isSettingsOpen: boolean;
  isCreatePlaylistOpen: boolean;
  radioRegion: string;
  setSettingsOpen: (open: boolean) => void;
  setCreatePlaylistOpen: (open: boolean) => void;
  setRadioRegion: (region: string) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isSettingsOpen: false,
  isCreatePlaylistOpen: false,
  radioRegion: 'Hessen',
  setSettingsOpen: (open: boolean) => set({ isSettingsOpen: open }),
  setCreatePlaylistOpen: (open: boolean) => set({ isCreatePlaylistOpen: open }),
  setRadioRegion: (region: boolean | string) => {
    if (typeof region === 'string') {
      set({ radioRegion: region });
    }
  },
}));
