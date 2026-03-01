import React from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Playlist } from '@musicserver/shared';
import { useUIStore } from '@/stores/uiStore';
import { useSectionStore } from '@/stores/sectionStore';
import { SectionSwitcher } from './SectionSwitcher';
import { SpherixLogo } from '@/components/ui/SpherixLogo';
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
  ChevronRight,
  Plus,
  Pin,
  Headphones,
  Film,
  Tv,
  Tag,
  Bookmark,
  Heart,
  Users,
  Library,
  MonitorPlay,
  Play,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

type NavSection = { title: string; items: { to: string; icon: React.ElementType; label: string }[] };

const MUSIC_NAV: NavSection[] = [
  {
    title: 'Mediathek',
    items: [
      { to: '/music',                icon: PlayCircle, label: 'Jetzt hören' },
      { to: '/music/recently-added', icon: Clock,      label: 'Zuletzt hinzugefügt' },
      { to: '/music/artists',        icon: Mic2,       label: 'Künstler' },
      { to: '/music/albums',         icon: Disc3,      label: 'Alben' },
      { to: '/music/songs',          icon: Music,      label: 'Titel' },
    ],
  },
  {
    title: 'Entdecken',
    items: [
      { to: '/music/browse',    icon: LayoutGrid, label: 'Entdecken' },
      { to: '/music/radio',     icon: Radio,      label: 'Radio' },
      { to: '/music/podcasts',  icon: Headphones, label: 'Podcasts' },
    ],
  },
];

const VIDEO_NAV: NavSection[] = [
  {
    title: 'Mediathek',
    items: [
      { to: '/video/recently-added', icon: Clock,       label: 'Zuletzt hinzugefügt' },
      { to: '/video/movies',         icon: Film,        label: 'Filme' },
      { to: '/video/series',         icon: Tv,          label: 'Serien' },
      { to: '/video/continue',       icon: MonitorPlay, label: 'Weiterschauen' },
    ],
  },
  {
    title: 'Entdecken',
    items: [
      { to: '/video/browse',  icon: LayoutGrid, label: 'Entdecken' },
      { to: '/video/genres',  icon: Tag,        label: 'Genres' },
    ],
  },
  {
    title: 'Sammlungen',
    items: [
      { to: '/video/watchlist',  icon: Bookmark, label: 'Watchlist' },
      { to: '/video/favorites',  icon: Heart,    label: 'Favoriten' },
    ],
  },
];

const AUDIOBOOK_NAV: NavSection[] = [
  {
    title: 'Mediathek',
    items: [
      { to: '/audiobooks/recent',   icon: Clock,    label: 'Zuletzt gehört' },
      { to: '/audiobooks',          icon: Library,  label: 'Alle Hörbücher' },
      { to: '/audiobooks/authors',  icon: Users,    label: 'Autoren' },
      { to: '/audiobooks/continue', icon: Play,     label: 'Weiterhören' },
    ],
  },
  {
    title: 'Entdecken',
    items: [
      { to: '/audiobooks/browse',  icon: LayoutGrid, label: 'Entdecken' },
      { to: '/audiobooks/genres',  icon: Tag,        label: 'Genres' },
    ],
  },
  {
    title: 'Sammlungen',
    items: [
      { to: '/audiobooks/bookmarks', icon: Bookmark, label: 'Lesezeichen' },
      { to: '/audiobooks/favorites', icon: Heart,    label: 'Favoriten' },
    ],
  },
];

const NAV_BY_SECTION = { music: MUSIC_NAV, video: VIDEO_NAV, audiobook: AUDIOBOOK_NAV };

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const queryClient = useQueryClient();
  const setCreatePlaylistOpen = useUIStore((state) => state.setCreatePlaylistOpen);
  const { section } = useSectionStore();

  const { data: playlistsData } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => api.get<{ data: Playlist[] }>('/playlists'),
    enabled: section === 'music',
  });

  const togglePin = useMutation({
    mutationFn: (id: string) => api.patch(`/playlists/${id}/pin`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['playlists'] }),
  });

  const handleCreatePlaylist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCreatePlaylistOpen(true);
  };

  const playlists = playlistsData?.data ?? [];
  const navSections = NAV_BY_SECTION[section];

  return (
    <aside
      className={cn(
        'flex flex-col bg-[#121212] text-sidebar-foreground border-r border-white/5 transition-all duration-300 ease-in-out z-50',
        collapsed ? 'w-[70px]' : 'w-[260px]',
      )}
    >
      {/* Logo / Header */}
      <div className="flex items-center gap-3 px-4 h-14 shrink-0">
        <SpherixLogo className="h-8 w-8 shrink-0 text-section-accent" />
        {!collapsed && (
          <span className="font-bold text-xl tracking-tight text-white">Spherix</span>
        )}
      </div>

      {/* Section Switcher */}
      <SectionSwitcher collapsed={collapsed} />

      {/* Navigation */}
      <ScrollArea className="flex-1">
        <div className="py-3 flex flex-col gap-5">
          {navSections.map((navSection) => (
            <div key={navSection.title} className="px-3">
              {!collapsed && (
                <h3 className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                  {navSection.title}
                </h3>
              )}
              <nav className="flex flex-col gap-0.5">
                {navSection.items.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/music' || to === '/audiobooks' || to === '/audiobooks/recent'}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-3 rounded-md px-3 py-1.5 text-[13px] font-medium transition-all duration-200 relative',
                        isActive
                          ? 'nav-active'
                          : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
                        collapsed && 'justify-center px-0 h-10 w-10 mx-auto',
                      )
                    }
                  >
                    <Icon className={cn('h-[18px] w-[18px] shrink-0', collapsed && 'h-5 w-5')} />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{label}</span>
                        <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />
                      </>
                    )}
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}

          {/* Playlists — only visible in Music section */}
          {section === 'music' && (
            <div className="px-3 pb-8">
              {!collapsed && (
                <div className="group flex items-center justify-between px-3 mb-1.5">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                    Playlists
                  </h3>
                  <button
                    onClick={handleCreatePlaylist}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-white/10 rounded transition-all text-muted-foreground hover:text-white"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              )}
              <nav className="flex flex-col gap-0.5">
                <NavLink
                  to="/music/playlists"
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-md px-3 py-1.5 text-[13px] font-medium transition-all duration-200',
                      isActive ? 'nav-active' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
                      collapsed && 'justify-center px-0 h-10 w-10 mx-auto',
                    )
                  }
                >
                  <ListMusic className="h-[18px] w-[18px] shrink-0 text-zinc-400" />
                  {!collapsed && <span className="flex-1 truncate">Alle Playlists</span>}
                </NavLink>

                {!collapsed &&
                  playlists.map((playlist) => (
                    <div key={playlist.id} className="group flex items-center pr-2">
                      <NavLink
                        to={`/music/playlists/${playlist.id}`}
                        className={({ isActive }) =>
                          cn(
                            'flex-1 flex items-center gap-3 rounded-md px-3 py-1.5 text-[13px] font-medium transition-all truncate',
                            isActive ? 'nav-active' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300',
                          )
                        }
                      >
                        <Music className="h-[14px] w-[14px] shrink-0 opacity-40" />
                        <span className="flex-1 truncate">{playlist.name}</span>
                      </NavLink>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          togglePin.mutate(playlist.id);
                        }}
                        className={cn(
                          'opacity-0 group-hover:opacity-40 hover:opacity-100 p-1 transition-all',
                          playlist.isPinned && 'opacity-100 text-blue-400',
                        )}
                      >
                        <Pin className={cn('h-3 w-3', playlist.isPinned && 'fill-current')} />
                      </button>
                    </div>
                  ))}
              </nav>
            </div>
          )}
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
            collapsed ? 'px-0' : 'justify-start px-3',
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
