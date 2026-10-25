import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { User } from 'lucide-react'
import { api } from '@/lib/api'
import { AlbumGrid } from '@/components/AlbumCard'
import { TrackList } from '@/components/TrackList'
import { EmptyState, LoadingState } from '@/components/ui/Spinner'

export function SearchPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['search', query],
    queryFn: () => api.search(query),
    enabled: query.length > 0,
  })

  if (!query) return <EmptyState title="Search your library" description="Type in the box above." />
  if (isLoading) return <LoadingState label="Searching" />

  const artists = data?.artists ?? []
  const albums = data?.albums ?? []
  const tracks = data?.tracks ?? []

  if (artists.length === 0 && albums.length === 0 && tracks.length === 0) {
    return <EmptyState title={`Nothing found for "${query}"`} />
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight">
        Results for <span className="text-accent">{query}</span>
      </h1>

      {tracks.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold tracking-tight">Songs</h2>
          <TrackList tracks={tracks} onStarChanged={() => void refetch()} />
        </section>
      )}

      {albums.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold tracking-tight">Albums</h2>
          <AlbumGrid albums={albums} />
        </section>
      )}

      {artists.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold tracking-tight">Artists</h2>
          <div className="flex flex-wrap gap-3">
            {artists.map((artist) => (
              <Link
                key={artist.id}
                to={`/artists/${artist.id}`}
                className="flex items-center gap-3 rounded-full bg-surface py-2 pr-5 pl-2 transition-colors hover:bg-elevated"
              >
                <span className="grid h-9 w-9 place-items-center rounded-full bg-elevated text-muted">
                  <User className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium">{artist.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
