import { create } from 'zustand';

interface UIState {
  isSettingsOpen: boolean;
  isCreatePlaylistOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  setCreatePlaylistOpen: (open: boolean) => void;
  isAnyModalOpen: () => boolean;
}

export const useUIStore = create<UIState>((set, get) => ({
  isSettingsOpen: false,
  isCreatePlaylistOpen: false,
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setCreatePlaylistOpen: (open) => set({ isCreatePlaylistOpen: open }),
  isAnyModalOpen: () => get().isSettingsOpen || get().isCreatePlaylistOpen,
}));
