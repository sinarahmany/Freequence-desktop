import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoadingState } from '@/components/ui/Spinner'
import { useSession } from '@/hooks/useSession'
import { AlbumDetailPage } from '@/pages/AlbumDetailPage'
import { AlbumsPage } from '@/pages/AlbumsPage'
import { ArtistDetailPage } from '@/pages/ArtistDetailPage'
import { ArtistsPage } from '@/pages/ArtistsPage'
import { FavoritesPage } from '@/pages/FavoritesPage'
import { GenreDetailPage } from '@/pages/GenreDetailPage'
import { GenresPage } from '@/pages/GenresPage'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { PlaylistDetailPage } from '@/pages/PlaylistDetailPage'
import { SearchPage } from '@/pages/SearchPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { SongsPage } from '@/pages/SongsPage'

export function App() {
  const { session, loading } = useSession()

  if (loading) return <LoadingState label="Starting" />
  if (!session) return <LoginPage />

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="albums" element={<AlbumsPage />} />
        <Route path="albums/:id" element={<AlbumDetailPage />} />
        <Route path="artists" element={<ArtistsPage />} />
        <Route path="artists/:id" element={<ArtistDetailPage />} />
        <Route path="songs" element={<SongsPage />} />
        <Route path="genres" element={<GenresPage />} />
        <Route path="genres/:name" element={<GenreDetailPage />} />
        <Route path="favorites" element={<FavoritesPage />} />
        <Route path="playlists/:id" element={<PlaylistDetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="settings" element={<SettingsPage />} />
        {/* Unknown client-side routes go home rather than showing a dead end. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
