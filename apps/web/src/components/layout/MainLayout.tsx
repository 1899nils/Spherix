import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { PlayerBar } from './PlayerBar';
import { ScrollArea } from '@/components/ui/scroll-area';

import { Header } from './Header';
import { useUIStore } from '@/stores/uiStore';

export function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { isSettingsOpen, isCreatePlaylistOpen } = useUIStore();
  const isAnyModalOpen = isSettingsOpen || isCreatePlaylistOpen;

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
          <main className="p-6 pb-32">
            <Outlet />
          </main>
        </ScrollArea>

        {/* Player Bar */}
        {!isAnyModalOpen && <PlayerBar />}
      </div>
    </div>
  );
}
