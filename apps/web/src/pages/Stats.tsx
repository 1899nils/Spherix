import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import {
  Music, Disc3, Mic2, ListMusic, Film, Tv, BookOpen, Podcast,
  BarChart2, Clock, TrendingUp,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LibraryCounts {
  tracks: number; albums: number; artists: number; playlists: number;
  movies: number; series: number; audiobooks: number; podcasts: number;
}

interface TopArtist { id: string; name: string; imageUrl: string | null; plays: number }
interface TopAlbum  { id: string; title: string; coverUrl: string | null; artist: string; plays: number }
interface RecentPlay {
  playedAt: string;
  track: {
    id: string; title: string; duration: number | null;
    album: { id: string; title: string; coverUrl: string | null; artist: { name: string } | null } | null;
  } | null;
}
interface DayCount { day: string; count: number }

interface StatsData {
  library: LibraryCounts;
  topArtists: TopArtist[];
  topAlbums: TopAlbum[];
  recentPlays: RecentPlay[];
  playHistoryByDay: DayCount[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(secs: number | null): string {
  if (!secs) return '-';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number; color: string;
}) {
  return (
    <div className="bg-[#1a1a1a] rounded-xl p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-[#b3b3b3] text-xs font-medium uppercase tracking-wider">{label}</p>
        <p className="text-white text-2xl font-bold">{value.toLocaleString('de-DE')}</p>
      </div>
    </div>
  );
}

/** Simple bar chart using CSS. */
function ActivityChart({ data }: { data: DayCount[] }) {
  if (data.length === 0) return <p className="text-[#b3b3b3] text-sm">Keine Daten verfügbar.</p>;

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-1 h-24 w-full">
      {data.map((d) => {
        const heightPct = Math.round((d.count / max) * 100);
        return (
          <div
            key={d.day}
            className="flex-1 flex flex-col items-center gap-1 group relative"
          >
            <div
              className="w-full rounded-t bg-[#1db954] opacity-80 group-hover:opacity-100 transition-opacity"
              style={{ height: `${heightPct}%` }}
            />
            {/* Tooltip on hover */}
            <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center">
              <div className="bg-black text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap shadow">
                {d.day}: {d.count}×
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Stats() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get<{ data: StatsData }>('/stats').then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }

  if (isError || !data) {
    return <p className="text-red-400 py-10">Statistiken konnten nicht geladen werden.</p>;
  }

  const { library, topArtists, topAlbums, recentPlays, playHistoryByDay } = data;

  return (
    <div className="space-y-10 max-w-5xl">
      {/* Header */}
      <div>
        <p className="text-xs text-[#b3b3b3] uppercase tracking-widest font-semibold mb-1">Übersicht</p>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <BarChart2 className="h-7 w-7 text-[#1db954]" />
          Statistiken
        </h1>
      </div>

      {/* Library counts */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Mediathek</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={Music}    label="Titel"      value={library.tracks}     color="bg-[#1db954]" />
          <StatCard icon={Disc3}    label="Alben"      value={library.albums}     color="bg-blue-600" />
          <StatCard icon={Mic2}     label="Künstler"   value={library.artists}    color="bg-purple-600" />
          <StatCard icon={ListMusic} label="Playlists" value={library.playlists}  color="bg-orange-600" />
          <StatCard icon={Film}     label="Filme"      value={library.movies}     color="bg-red-600" />
          <StatCard icon={Tv}       label="Serien"     value={library.series}     color="bg-pink-600" />
          <StatCard icon={BookOpen} label="Hörbücher"  value={library.audiobooks} color="bg-yellow-600" />
          <StatCard icon={Podcast}  label="Podcasts"   value={library.podcasts}   color="bg-teal-600" />
        </div>
      </section>

      {/* Activity chart */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-[#1db954]" />
          Aktivität — letzte 30 Tage
        </h2>
        <div className="bg-[#1a1a1a] rounded-xl p-5">
          <ActivityChart data={playHistoryByDay} />
          <p className="text-[#b3b3b3] text-xs mt-2">
            Gesamt: {playHistoryByDay.reduce((s, d) => s + d.count, 0).toLocaleString('de-DE')} Wiedergaben
          </p>
        </div>
      </section>

      {/* Top artists + top albums */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top artists */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Mic2 className="h-5 w-5 text-[#1db954]" />
            Top-Künstler
          </h2>
          {topArtists.length === 0 ? (
            <p className="text-[#b3b3b3] text-sm">Noch keine Wiedergaben.</p>
          ) : (
            <ol className="space-y-2">
              {topArtists.map((a, i) => (
                <li key={a.id} className="flex items-center gap-3 bg-[#1a1a1a] rounded-lg p-3">
                  <span className="text-[#b3b3b3] text-sm w-5 text-right">{i + 1}</span>
                  <div className="h-9 w-9 rounded-full bg-[#282828] overflow-hidden flex-shrink-0">
                    {a.imageUrl
                      ? <img src={a.imageUrl} alt={a.name} className="h-full w-full object-cover" />
                      : <div className="h-full w-full flex items-center justify-center"><Mic2 className="h-4 w-4 text-[#b3b3b3]" /></div>
                    }
                  </div>
                  <Link to={`/music/artists/${a.id}`} className="flex-1 text-white text-sm font-medium hover:underline truncate">
                    {a.name}
                  </Link>
                  <span className="text-[#b3b3b3] text-xs whitespace-nowrap">{a.plays}×</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Top albums */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Disc3 className="h-5 w-5 text-[#1db954]" />
            Top-Alben
          </h2>
          {topAlbums.length === 0 ? (
            <p className="text-[#b3b3b3] text-sm">Noch keine Wiedergaben.</p>
          ) : (
            <ol className="space-y-2">
              {topAlbums.map((a, i) => (
                <li key={a.id} className="flex items-center gap-3 bg-[#1a1a1a] rounded-lg p-3">
                  <span className="text-[#b3b3b3] text-sm w-5 text-right">{i + 1}</span>
                  <div className="h-9 w-9 rounded bg-[#282828] overflow-hidden flex-shrink-0">
                    {a.coverUrl
                      ? <img src={a.coverUrl} alt={a.title} className="h-full w-full object-cover" />
                      : <div className="h-full w-full flex items-center justify-center"><Disc3 className="h-4 w-4 text-[#b3b3b3]" /></div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link to={`/music/albums/${a.id}`} className="text-white text-sm font-medium hover:underline block truncate">
                      {a.title}
                    </Link>
                    <p className="text-[#b3b3b3] text-xs truncate">{a.artist}</p>
                  </div>
                  <span className="text-[#b3b3b3] text-xs whitespace-nowrap">{a.plays}×</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Recent plays */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Clock className="h-5 w-5 text-[#1db954]" />
          Zuletzt gehört
        </h2>
        {recentPlays.length === 0 ? (
          <p className="text-[#b3b3b3] text-sm">Noch keine Wiedergaben.</p>
        ) : (
          <div className="bg-[#1a1a1a] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-[#b3b3b3] text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Titel</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Album</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Länge</th>
                  <th className="text-left px-4 py-3 font-medium">Gespielt</th>
                </tr>
              </thead>
              <tbody>
                {recentPlays.map((p, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-[#282828] overflow-hidden flex-shrink-0">
                          {p.track?.album?.coverUrl
                            ? <img src={p.track.album.coverUrl} alt="" className="h-full w-full object-cover" />
                            : <div className="h-full w-full flex items-center justify-center"><Music className="h-3.5 w-3.5 text-[#b3b3b3]" /></div>
                          }
                        </div>
                        <div className="min-w-0">
                          <p className="text-white font-medium truncate">{p.track?.title ?? 'Unbekannt'}</p>
                          <p className="text-[#b3b3b3] text-xs truncate">{p.track?.album?.artist?.name ?? '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#b3b3b3] hidden md:table-cell truncate max-w-[160px]">
                      {p.track?.album?.title ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-[#b3b3b3] hidden sm:table-cell">
                      {fmtDuration(p.track?.duration ?? null)}
                    </td>
                    <td className="px-4 py-3 text-[#b3b3b3] whitespace-nowrap">
                      {fmtDate(p.playedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
