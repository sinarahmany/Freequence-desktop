import { useQuery } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { api } from '@/lib/api'
import { usePlayer } from '@/store/playerStore'
import { AlbumGrid } from '@/components/AlbumCard'
import { TrackList } from '@/components/TrackList'
import { Button } from '@/components/ui/Button'
import { EmptyState, LoadingState } from '@/components/ui/Spinner'

export function FavoritesPage() {
  const playTracks = usePlayer((s) => s.playTracks)
  const { data, isLoading, refetch } = useQuery({ queryKey: ['starred'], queryFn: api.starred })

  if (isLoading) return <LoadingState />

  const albums = data?.albums ?? []
  const tracks = data?.tracks ?? []

  if (albums.length === 0 && tracks.length === 0) {
    return (
      <EmptyState
        title="No favorites yet"
        description="Tap the heart on any song or album and it will show up here, in the web player and in your Subsonic apps."
      />
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight">Favorites</h1>

      {tracks.length > 0 && (
        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">Songs</h2>
            <Button variant="primary" size="sm" onClick={() => playTracks(tracks)}>
              <Play className="h-4 w-4" fill="currentColor" />
              Play all
            </Button>
          </div>
          <TrackList tracks={tracks} onStarChanged={() => void refetch()} />
        </section>
      )}

      {albums.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold tracking-tight">Albums</h2>
          <AlbumGrid albums={albums} />
        </section>
      )}
    </div>
  )
}
