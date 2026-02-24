import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Home,
  Library,
  Disc3,
  Mic2,
  ListMusic,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Music2,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  PlayCircle,
  LayoutGrid,
  Radio,
  Clock,
  Mic2,
  Disc3,
  Music,
  ListMusic,
  PanelLeftClose,
  PanelLeft,
  Music2,
  ChevronRight,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const sections = [
  {
    title: 'Music',
    items: [
      { to: '/', icon: PlayCircle, label: 'Jetzt hören', color: 'text-red-500' },
      { to: '/browse', icon: LayoutGrid, label: 'Entdecken', color: 'text-blue-500' },
      { to: '/radio', icon: Radio, label: 'Radio', color: 'text-pink-500' },
    ],
  },
  {
    title: 'Mediathek',
    items: [
      { to: '/recently-added', icon: Clock, label: 'Zuletzt hinzugefügt', color: 'text-red-500' },
      { to: '/artists', icon: Mic2, label: 'Künstler', color: 'text-red-500' },
      { to: '/albums', icon: Disc3, label: 'Alben', color: 'text-red-500' },
      { to: '/songs', icon: Music, label: 'Titel', color: 'text-red-500' },
    ],
  },
  {
    title: 'Playlists',
    items: [
      { to: '/playlists', icon: ListMusic, label: 'Alle Playlists', color: 'text-red-500' },
    ],
  },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex flex-col bg-[#121212] text-sidebar-foreground border-r border-white/5 transition-all duration-300 ease-in-out z-50',
        collapsed ? 'w-[70px]' : 'w-[260px]',
      )}
    >
      {/* Logo / Header */}
      <div className="flex items-center gap-3 px-6 h-16 shrink-0">
        <div className="h-8 w-8 bg-gradient-to-br from-pink-500 to-red-600 rounded-lg flex items-center justify-center shadow-lg">
          <Music2 className="h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <span className="font-bold text-lg tracking-tight text-white">MusicServer</span>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1">
        <div className="py-4 flex flex-col gap-6">
          {sections.map((section) => (
            <div key={section.title} className="px-3">
              {!collapsed && (
                <h3 className="px-4 mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  {section.title}
                </h3>
              )}
              <nav className="flex flex-col gap-0.5">
                {section.items.map(({ to, icon: Icon, label, color }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-3 rounded-md px-3 py-1.5 text-[13px] font-medium transition-all duration-200 relative',
                        isActive
                          ? 'bg-white/10 text-white'
                          : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
                        collapsed && 'justify-center px-0 h-10 w-10 mx-auto',
                      )
                    }
                  >
                    <Icon className={cn(
                      "h-[18px] w-[18px] shrink-0 transition-colors",
                      collapsed ? "h-5 w-5" : ""
                    )} />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{label}</span>
                        <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />
                      </>
                    )}
                    {/* Active Indicator Dot for collapsed view */}
                    {collapsed && (
                      <div className={cn(
                        "absolute -right-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-red-500 opacity-0 transition-opacity",
                        "group-[.active]:opacity-100" // This works with NavLink's default active class
                      )} />
                    )}
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Collapse Toggle */}
      <div className="p-3 mt-auto border-t border-white/5 bg-[#121212]/50 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className={cn(
            'w-full hover:bg-white/5 text-zinc-500 hover:text-zinc-300',
            collapsed ? 'px-0' : 'justify-start px-3'
          )}
        >
          {collapsed ? (
            <PanelLeft className="h-5 w-5 mx-auto" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 mr-2" />
              <span className="text-xs font-semibold">Sidebar verbergen</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}

