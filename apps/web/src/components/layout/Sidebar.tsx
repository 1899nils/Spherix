import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Home,
  Library,
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

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/library', icon: Library, label: 'Bibliothek' },
  { to: '/artists', icon: Mic2, label: 'Künstler' },
  { to: '/playlists', icon: ListMusic, label: 'Playlists' },
  { to: '/settings', icon: Settings, label: 'Einstellungen' },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex flex-col bg-sidebar text-sidebar-foreground border-r border-border transition-all duration-200 ease-in-out',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Logo / Header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border shrink-0">
        <Music2 className="h-6 w-6 text-primary shrink-0" />
        {!collapsed && (
          <span className="font-semibold text-lg truncate">MusicServer</span>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-2">
        <nav className="flex flex-col gap-1 px-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  'hover:bg-sidebar-accent hover:text-foreground',
                  isActive
                    ? 'bg-sidebar-accent text-foreground'
                    : 'text-muted-foreground',
                  collapsed && 'justify-center px-0',
                )
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>
      </ScrollArea>

      {/* Collapse Toggle */}
      <div className="border-t border-border p-2 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn('w-full', collapsed ? '' : 'justify-start px-3')}
        >
          {collapsed ? (
            <PanelLeft className="h-5 w-5" />
          ) : (
            <>
              <PanelLeftClose className="h-5 w-5 mr-2" />
              <span className="text-sm">Einklappen</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
