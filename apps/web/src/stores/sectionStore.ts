import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppSection = 'music' | 'video' | 'audiobook';

interface SectionState {
  section: AppSection;
  setSection: (s: AppSection) => void;
}

export const useSectionStore = create<SectionState>()(
  persist(
    (set) => ({
      section: 'music',
      setSection: (section) => {
        document.documentElement.dataset.section = section;
        set({ section });
      },
    }),
    {
      name: 'spherix-section',
      onRehydrateStorage: () => (state) => {
        // Apply the persisted section to <html> on initial load
        if (state) {
          document.documentElement.dataset.section = state.section;
        }
      },
    },
  ),
);

// Apply default on import (before React mounts)
document.documentElement.dataset.section =
  (JSON.parse(localStorage.getItem('spherix-section') ?? '{}')?.state?.section as AppSection) ?? 'music';
