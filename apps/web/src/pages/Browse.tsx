import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { usePlayerStore } from '@/stores/playerStore';
import type { TrackWithRelations } from '@musicserver/shared';
import {
  Play, Pause, Music, Radio as RadioIcon, ListMusic, Disc3,
  ChevronRight, Shuffle, User2, Loader2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecentItem {
  type: 'album' | 'playlist' | 'radio';
  id: string;
  title: string;
  subtitle: string;
  coverUrl: string | null;
  playedAt: string;
  url?: string; // radio stream url
}

interface TopArtist {
  id: string;
  name: string;
  imageUrl: string | null;
  playCount: number;
}

interface AutoPlaylist {
  id: string;
  name: string;
  description: string;
  coverColor: string;
  coverUrl: string | null;
  trackIds: string[];
}

interface PlaylistItem {
  id: string;
  name: string;
  coverUrl: string | null;
  trackCount: number;
  isPinned: boolean;
}

interface NewAlbum {
  id: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  year: number | null;
}

interface DiscoverSummary {
  username: string;
  recentlyPlayed: RecentItem[];
  topArtists: TopArtist[];
  autoPlaylists: AutoPlaylist[];
  forYouPlaylists: PlaylistItem[];
  newAdditions: NewAlbum[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Guten Morgen';
  if (h < 18) return 'Guten Nachmittag';
  return 'Guten Abend';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CoverImage({
  src, alt, size = 'md', icon: Icon = Music, rounded = false,
}: {
  src: string | null; alt: string; size?: 'sm' | 'md' | 'lg';
  icon?: React.ElementType; rounded?: boolean;
}) {
  const [error, setError] = useState(false);
  const dim = size === 'sm' ? 'h-12 w-12' : size === 'md' ? 'h-full w-full' : 'h-full w-full';
  const iconDim = size === 'sm' ? 'h-5 w-5' : 'h-10 w-10';

  if (src && !error) {
    return (
      <img
        src={src} alt={alt}
        className={`${dim} object-cover ${rounded ? 'rounded-full' : ''}`}
        onError={() => setError(true)}
      />
    );
  }
  return (
    <div className={`${dim} flex items-center justify-center bg-[#2a2a2a] ${rounded ? 'rounded-full' : ''}`}>
      <Icon className={`${iconDim} text-[#b3b3b3]`} />
    </div>
  );
}

/** Horizontal scroll section with optional "all" link */
function Section({
  title, subtitle, href, children,
}: {
  title: string; subtitle?: string; href?: string; children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          {subtitle && <p className="text-xs text-[#b3b3b3] uppercase tracking-widest font-semibold mb-0.5">{subtitle}</p>}
          <h2 className="text-2xl font-bold text-white leading-tight">{title}</h2>
        </div>
        {href && (
          <Link to={href} className="text-xs text-[#b3b3b3] hover:text-white uppercase tracking-wider font-semibold transition-colors flex items-center gap-1">
            Alle anzeigen <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
        {children}
      </div>
    </section>
  );
}

/** Card used for albums, playlists, mixes, new additions */
function MediaCard({
  title, subtitle, coverUrl, coverColor, icon: Icon = Music,
  onClick, playable, isPlaying, isLoading,
}: {
  title: string; subtitle?: string; coverUrl?: string | null;
  coverColor?: string; icon?: React.ElementType;
  onClick?: () => void; playable?: boolean;
  isPlaying?: boolean; isLoading?: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="group relative shrink-0 w-44 snap-start cursor-pointer"
      onClick={onClick}
    >
      {/* Cover */}
      <div
        className="relative w-44 h-44 rounded-lg overflow-hidden mb-3 shadow-lg"
        style={coverColor && (!coverUrl || imgError) ? { background: `linear-gradient(135deg, ${coverColor}cc, ${coverColor}55)` } : undefined}
      >
        {coverUrl && !imgError ? (
          <img src={coverUrl} alt={title} className="w-full h-full object-cover" onError={() => setImgError(true)} />
        ) : coverColor ? (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-white/30 text-5xl font-black select-none">{title.slice(0, 2).toUpperCase()}</span>
          </div>
        ) : (
          <div className="w-full h-full bg-[#2a2a2a] flex items-center justify-center">
            <Icon className="h-14 w-14 text-[#b3b3b3]" />
          </div>
        )}

        {/* Play overlay */}
        {playable && (
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-3">
            <button
              className="h-12 w-12 rounded-full bg-[#dc2626] hover:bg-[#b91c1c] hover:scale-105 transition-all flex items-center justify-center shadow-xl"
              onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 text-white animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-5 w-5 text-white fill-white" />
              ) : (
                <Play className="h-5 w-5 text-white fill-white ml-0.5" />
              )}
            </button>
          </div>
        )}
      </div>

      <p className="text-white font-semibold text-sm truncate leading-snug">{title}</p>
      {subtitle && <p className="text-[#b3b3b3] text-xs truncate mt-0.5 leading-snug">{subtitle}</p>}
    </div>
  );
}

/** Artist card (circular image) */
function ArtistCard({ artist }: { artist: TopArtist }) {
  return (
    <Link to={`/music/artists/${artist.id}`} className="group relative shrink-0 w-36 snap-start text-center cursor-pointer">
      <div className="relative w-36 h-36 rounded-full overflow-hidden mx-auto mb-3 shadow-lg bg-[#2a2a2a]">
        {artist.imageUrl ? (
          <img src={artist.imageUrl} alt={artist.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User2 className="h-16 w-16 text-[#b3b3b3]" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-full" />
      </div>
      <p className="text-white font-semibold text-sm truncate">{artist.name}</p>
      <p className="text-[#b3b3b3] text-xs mt-0.5">Künstler</p>
    </Link>
  );
}

/** Compact recently-played card (2-column layout at top) */
function RecentCard({
  item, onPlay, isPlaying,
}: {
  item: RecentItem; onPlay: (item: RecentItem) => void; isPlaying: boolean;
}) {
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);

  const Icon = item.type === 'radio' ? RadioIcon : item.type === 'playlist' ? ListMusic : Disc3;

  const handleClick = () => {
    if (item.type === 'album') navigate(`/music/albums/${item.id}`);
    else if (item.type === 'playlist') navigate(`/music/playlists/${item.id}`);
    else onPlay(item);
  };

  return (
    <div
      className={`group flex items-center gap-3 bg-[#1c1c1e] hover:bg-[#2a2a2a] rounded-md overflow-hidden cursor-pointer transition-colors pr-3 ${isPlaying ? 'ring-1 ring-[#dc2626]/50' : ''}`}
      onClick={handleClick}
    >
      {/* Cover thumbnail */}
      <div className="h-14 w-14 shrink-0 bg-[#282828] flex items-center justify-center overflow-hidden">
        {item.coverUrl && !imgError ? (
          <img src={item.coverUrl} alt={item.title} className="h-full w-full object-cover" onError={() => setImgError(true)} />
        ) : (
          <Icon className="h-6 w-6 text-[#b3b3b3]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isPlaying ? 'text-[#dc2626]' : 'text-white'}`}>{item.title}</p>
        <p className="text-xs text-[#b3b3b3] truncate">{item.subtitle}</p>
      </div>

      {/* Play button on hover */}
      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 rounded-full bg-[#dc2626] flex items-center justify-center shrink-0"
        onClick={(e) => { e.stopPropagation(); onPlay(item); }}
      >
        {isPlaying ? <Pause className="h-4 w-4 text-white fill-white" /> : <Play className="h-4 w-4 text-white fill-white ml-0.5" />}
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function Browse() {
  const { playTrack, playStream, currentTrack, isPlaying, togglePlay } = usePlayerStore();
  const [loadingMix, setLoadingMix] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['discover-summary'],
    queryFn: () => api.get<DiscoverSummary>('/discover/summary'),
    staleTime: 1000 * 60 * 5, // 5 min
  });

  const handlePlayMix = async (mix: AutoPlaylist) => {
    if (loadingMix) return;

    // Check if this mix is currently playing (heuristic: first track matches)
    const firstId = mix.trackIds[0];
    if (currentTrack && 'id' in currentTrack && currentTrack.id === firstId && isPlaying) {
      togglePlay();
      return;
    }

    setLoadingMix(mix.id);
    try {
      const result = await api.post<{ data: TrackWithRelations[] }>('/discover/resolve-tracks', {
        trackIds: mix.trackIds,
      });
      if (result.data.length > 0) {
        playTrack(result.data[0], result.data);
      }
    } finally {
      setLoadingMix(null);
    }
  };

  const handlePlayRecent = async (item: RecentItem) => {
    if (item.type === 'radio' && item.url) {
      playStream({ id: item.id, name: item.title, url: item.url, favicon: item.coverUrl ?? undefined, isRadio: true });
      return;
    }
    if (item.type === 'album') {
      // Fetch album tracks and play
      try {
        const result = await api.get<{ data: { tracks: TrackWithRelations[] } }>(`/albums/${item.id}`);
        const tracks = result.data.tracks ?? [];
        if (tracks.length > 0) playTrack(tracks[0], tracks);
      } catch { /* ignore */ }
      return;
    }
    if (item.type === 'playlist') {
      try {
        const result = await api.get<{ data: { tracks: { track: TrackWithRelations }[] } }>(`/playlists/${item.id}`);
        const tracks = (result.data.tracks ?? []).map(pt => pt.track);
        if (tracks.length > 0) playTrack(tracks[0], tracks);
      } catch { /* ignore */ }
    }
  };

  const isRecentPlaying = (item: RecentItem) => {
    if (!currentTrack || !isPlaying) return false;
    if (item.type === 'radio') return 'isRadio' in currentTrack && currentTrack.id === item.id;
    return 'id' in currentTrack && currentTrack.id === item.id;
  };

  const isMixPlaying = (mix: AutoPlaylist) => {
    if (!currentTrack || !isPlaying || !('id' in currentTrack)) return false;
    return mix.trackIds.includes(currentTrack.id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-[#b3b3b3] animate-spin" />
      </div>
    );
  }

  const summary = data;

  return (
    <div className="space-y-10 pb-6">

      {/* ── Greeting ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl md:text-4xl font-black text-white">
          {greeting()}{summary?.username ? `, ${summary.username}` : ''}
        </h1>
      </div>

      {/* ── Recently Played ────────────────────────────────────────────────── */}
      {summary && summary.recentlyPlayed.length > 0 && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {summary.recentlyPlayed.map((item) => (
              <RecentCard
                key={`${item.type}-${item.id}`}
                item={item}
                onPlay={handlePlayRecent}
                isPlaying={isRecentPlaying(item)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Für Dich (Playlists) ────────────────────────────────────────────── */}
      {summary && summary.forYouPlaylists.length > 0 && (
        <Section title={summary.username ? `Für ${summary.username}` : 'Für Dich'} subtitle="Für" href="/music/playlists">
          {summary.forYouPlaylists.map((pl) => (
            <Link key={pl.id} to={`/music/playlists/${pl.id}`} className="contents">
              <MediaCard
                title={pl.name}
                subtitle={`${pl.trackCount} ${pl.trackCount === 1 ? 'Song' : 'Songs'}`}
                coverUrl={pl.coverUrl}
                icon={ListMusic}
                playable
                isPlaying={currentTrack && 'id' in currentTrack &&
                  isPlaying && false /* handled elsewhere */}
              />
            </Link>
          ))}
        </Section>
      )}

      {/* ── Deine Mixes (Auto-playlists) ───────────────────────────────────── */}
      {summary && summary.autoPlaylists.length > 0 && (
        <Section title="Deine Mixes">
          {summary.autoPlaylists.map((mix) => (
            <div key={mix.id} className="contents">
              <MediaCard
                title={mix.name}
                subtitle={mix.description}
                coverUrl={mix.coverUrl}
                coverColor={mix.coverColor}
                icon={Shuffle}
                playable
                isPlaying={isMixPlaying(mix)}
                isLoading={loadingMix === mix.id}
                onClick={() => handlePlayMix(mix)}
              />
            </div>
          ))}
        </Section>
      )}

      {/* ── Deine Lieblingskünstler ─────────────────────────────────────────── */}
      {summary && summary.topArtists.length > 0 && (
        <Section title="Deine Lieblingskünstler" href="/music/artists">
          {summary.topArtists.map((artist) => (
            <ArtistCard key={artist.id} artist={artist} />
          ))}
        </Section>
      )}

      {/* ── Neu in deiner Mediathek ─────────────────────────────────────────── */}
      {summary && summary.newAdditions.length > 0 && (
        <Section title="Neu in deiner Mediathek" href="/music/albums">
          {summary.newAdditions.map((album) => (
            <Link key={album.id} to={`/music/albums/${album.id}`} className="contents">
              <MediaCard
                title={album.title}
                subtitle={`${album.artist}${album.year ? ` · ${album.year}` : ''}`}
                coverUrl={album.coverUrl}
                icon={Disc3}
                playable={false}
              />
            </Link>
          ))}
        </Section>
      )}

      {/* Empty state when library is empty */}
      {summary && summary.recentlyPlayed.length === 0 &&
        summary.newAdditions.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
          <div className="h-20 w-20 bg-[#dc2626]/10 rounded-2xl flex items-center justify-center">
            <Music className="h-10 w-10 text-[#dc2626]/60" />
          </div>
          <div>
            <p className="text-white font-semibold text-lg">Deine Bibliothek ist leer</p>
            <p className="text-[#b3b3b3] mt-1 text-sm">Scanne deine Musik, um hier Empfehlungen zu sehen.</p>
          </div>
        </div>
      )}
    </div>
  );
}
