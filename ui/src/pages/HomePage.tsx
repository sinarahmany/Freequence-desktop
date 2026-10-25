import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatTotalTime } from '@/lib/utils'
import { AlbumGrid } from '@/components/AlbumCard'
import { TrackList } from '@/components/TrackList'
import { EmptyState, LoadingState } from '@/components/ui/Spinner'
import type { AlbumSort } from '@/lib/types'

function Section({
  title,
  to,
  children,
}: {
  title: string
  to?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-xl font-bold tracking-tight text-white">{title}</h2>
        {to && (
          <Link to={to} className="text-xs font-semibold text-muted hover:text-fg hover:underline">
            Show all
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function AlbumRow({ title, sort, to }: { title: string; sort: AlbumSort; to?: string }) {
  const { data: albums = [], isLoading } = useQuery({
    queryKey: ['albums', sort, 14],
    queryFn: () => api.albums({ sort, size: 14 }),
  })
  if (isLoading || albums.length === 0) return null
  return (
    <Section title={title} to={to}>
      <AlbumGrid albums={albums} />
    </Section>
  )
}

export function HomePage() {
  const { data: stats, isLoading } = useQuery({ queryKey: ['stats'], queryFn: api.stats })
  const { data: recent = [] } = useQuery({
    queryKey: ['recent'],
    queryFn: () => api.recentlyPlayed(10),
  })

  if (isLoading) return <LoadingState />

  if (stats && stats.tracks === 0) {
    return (
      <EmptyState
        title="Your library is empty"
        description="Add a folder from Settings. The files can stay where they are."
      />
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">Good listening</h1>
        {stats && (
          <p className="mt-1 text-sm text-muted">
            {stats.tracks.toLocaleString()} songs · {stats.albums.toLocaleString()} albums ·{' '}
            {stats.artists.toLocaleString()} artists · {formatTotalTime(stats.duration)}
          </p>
        )}
      </div>

      <AlbumRow title="Recently added" sort="newest" to="/albums" />

      {recent.length > 0 && (
        <Section title="Jump back in">
          <TrackList tracks={recent} />
        </Section>
      )}

      <AlbumRow title="Most played" sort="frequent" />
      <AlbumRow title="Random picks" sort="random" />
    </div>
  )
}
