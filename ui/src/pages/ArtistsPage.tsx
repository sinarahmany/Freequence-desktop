import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { User } from 'lucide-react'
import { api } from '@/lib/api'
import { CoverArt } from '@/components/CoverArt'
import { EmptyState, LoadingState } from '@/components/ui/Spinner'

export function ArtistsPage() {
  const { data: artists = [], isLoading } = useQuery({
    queryKey: ['artists'],
    queryFn: api.artists,
  })

  if (isLoading) return <LoadingState />
  if (artists.length === 0) return <EmptyState title="No artists yet" />

  return (
    <div>
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight">Artists</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {artists.map((artist) => (
          <Link
            key={artist.id}
            to={`/artists/${artist.id}`}
            className="flex min-w-0 flex-col items-center gap-3 overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-center transition-all hover:border-white/10 hover:bg-white/[0.07]"
          >
            <CoverArt
              id={artist.id}
              src={artist.coverArt}
              hasArt={Boolean(artist.coverArt)}
              alt={artist.name}
              fallback={<User className="h-1/3 w-1/3" strokeWidth={1.5} />}
              className="aspect-square w-full rounded-full"
            />
            <span className="w-full min-w-0">
              <span className="block truncate text-sm font-bold" title={artist.name}>
                {artist.name}
              </span>
              <span className="block truncate text-xs text-muted">
                {artist.albumCount} album{artist.albumCount === 1 ? '' : 's'}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
