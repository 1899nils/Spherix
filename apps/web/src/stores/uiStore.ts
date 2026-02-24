import { create } from 'zustand';

interface UIStore {
  isSettingsOpen: boolean;
  isCreatePlaylistOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  setCreatePlaylistOpen: (open: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  isSettingsOpen: false,
  isCreatePlaylistOpen: false,
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setCreatePlaylistOpen: (open) => set({ isCreatePlaylistOpen: open }),
}));
