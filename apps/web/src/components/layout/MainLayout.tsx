import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { PlayerBar } from './PlayerBar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Header } from './Header';
import { useUIStore } from '@/stores/uiStore';
import { CreatePlaylistModal } from './CreatePlaylistModal';
import { ErrorBoundary } from './ErrorBoundary';

export function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isCreatePlaylistOpen = useUIStore((state) => state.isCreatePlaylistOpen);
  const setCreatePlaylistOpen = useUIStore((state) => state.setCreatePlaylistOpen);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0">
        <Header />

        {/* Scrollable Content */}
        <ScrollArea className="flex-1">
          <main className="p-6 pb-32 bg-[#121212]">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
        </ScrollArea>

        {/* Player Bar */}
        {!isCreatePlaylistOpen && <PlayerBar />}
      </div>

      <CreatePlaylistModal
        isOpen={isCreatePlaylistOpen}
        onClose={() => setCreatePlaylistOpen(false)}
      />
    </div>
  );
}
