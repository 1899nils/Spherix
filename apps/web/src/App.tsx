import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Home } from '@/pages/Home';
import { Library } from '@/pages/Library';
import { Albums } from '@/pages/Albums';
import { AlbumDetail } from '@/pages/AlbumDetail';
import { Artists } from '@/pages/Artists';
import { ArtistDetail } from '@/pages/ArtistDetail';
import { Playlists } from '@/pages/Playlists';
import { PlaylistDetail } from '@/pages/PlaylistDetail';
import { Settings } from '@/pages/Settings';
import { RecentlyAdded } from '@/pages/RecentlyAdded';
import { Songs } from '@/pages/Songs';
import { Browse } from '@/pages/Browse';
import { Radio } from '@/pages/Radio';
import { Podcasts } from '@/pages/Podcasts';
import { PodcastDetail } from '@/pages/PodcastDetail';
import { VideoHome } from '@/pages/video/VideoHome';
import { Movies } from '@/pages/video/Movies';
import { Series } from '@/pages/video/Series';
import { AudiobooksHome } from '@/pages/audiobooks/AudiobooksHome';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            {/* Root redirect */}
            <Route path="/" element={<Navigate to="/music" replace />} />

            {/* ── Music ─────────────────────────────────────────── */}
            <Route path="/music" element={<Home />} />
            <Route path="/music/browse" element={<Browse />} />
            <Route path="/music/radio" element={<Radio />} />
            <Route path="/music/recently-added" element={<RecentlyAdded />} />
            <Route path="/music/library" element={<Library />} />
            <Route path="/music/albums" element={<Albums />} />
            <Route path="/music/albums/:id" element={<AlbumDetail />} />
            <Route path="/music/artists" element={<Artists />} />
            <Route path="/music/artists/:id" element={<ArtistDetail />} />
            <Route path="/music/songs" element={<Songs />} />
            <Route path="/music/playlists" element={<Playlists />} />
            <Route path="/music/playlists/:id" element={<PlaylistDetail />} />
            <Route path="/music/podcasts" element={<Podcasts />} />
            <Route path="/music/podcasts/:id" element={<PodcastDetail />} />

            {/* ── Video ─────────────────────────────────────────── */}
            <Route path="/video" element={<VideoHome />} />
            <Route path="/video/movies" element={<Movies />} />
            <Route path="/video/series" element={<Series />} />

            {/* ── Audiobooks ────────────────────────────────────── */}
            <Route path="/audiobooks" element={<AudiobooksHome />} />
            <Route path="/audiobooks/recent" element={<AudiobooksHome />} />

            {/* Settings (section-independent) */}
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
