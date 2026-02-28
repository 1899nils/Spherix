import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
            <Route path="/" element={<Home />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/radio" element={<Radio />} />
            <Route path="/recently-added" element={<RecentlyAdded />} />
            <Route path="/library" element={<Library />} />
            <Route path="/albums" element={<Albums />} />
            <Route path="/albums/:id" element={<AlbumDetail />} />
            <Route path="/artists" element={<Artists />} />
            <Route path="/artists/:id" element={<ArtistDetail />} />
            <Route path="/songs" element={<Songs />} />
            <Route path="/playlists" element={<Playlists />} />
            <Route path="/playlists/:id" element={<PlaylistDetail />} />
            <Route path="/podcasts" element={<Podcasts />} />
            <Route path="/podcasts/:id" element={<PodcastDetail />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
