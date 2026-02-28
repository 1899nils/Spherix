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
import { VideoRecentlyAdded } from '@/pages/video/RecentlyAdded';
import { ContinueWatching } from '@/pages/video/ContinueWatching';
import { VideoBrowse } from '@/pages/video/VideoBrowse';
import { VideoGenres } from '@/pages/video/VideoGenres';
import { VideoWatchlist } from '@/pages/video/VideoWatchlist';
import { VideoFavorites } from '@/pages/video/VideoFavorites';
import { AudiobooksHome } from '@/pages/audiobooks/AudiobooksHome';
import { AudiobooksAll } from '@/pages/audiobooks/All';
import { AudiobooksAuthors } from '@/pages/audiobooks/Authors';
import { AudiobooksContinue } from '@/pages/audiobooks/Continue';
import { AudiobooksBrowse } from '@/pages/audiobooks/Browse';
import { AudiobooksGenres } from '@/pages/audiobooks/Genres';
import { AudiobooksBookmarks } from '@/pages/audiobooks/Bookmarks';
import { AudiobooksFavorites } from '@/pages/audiobooks/Favorites';

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
            <Route path="/video/recently-added" element={<VideoRecentlyAdded />} />
            <Route path="/video/movies" element={<Movies />} />
            <Route path="/video/series" element={<Series />} />
            <Route path="/video/continue" element={<ContinueWatching />} />
            <Route path="/video/browse" element={<VideoBrowse />} />
            <Route path="/video/genres" element={<VideoGenres />} />
            <Route path="/video/watchlist" element={<VideoWatchlist />} />
            <Route path="/video/favorites" element={<VideoFavorites />} />

            {/* ── Audiobooks ────────────────────────────────────── */}
            <Route path="/audiobooks" element={<AudiobooksAll />} />
            <Route path="/audiobooks/recent" element={<AudiobooksHome />} />
            <Route path="/audiobooks/authors" element={<AudiobooksAuthors />} />
            <Route path="/audiobooks/continue" element={<AudiobooksContinue />} />
            <Route path="/audiobooks/browse" element={<AudiobooksBrowse />} />
            <Route path="/audiobooks/genres" element={<AudiobooksGenres />} />
            <Route path="/audiobooks/bookmarks" element={<AudiobooksBookmarks />} />
            <Route path="/audiobooks/favorites" element={<AudiobooksFavorites />} />

            {/* Settings (section-independent) */}
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
