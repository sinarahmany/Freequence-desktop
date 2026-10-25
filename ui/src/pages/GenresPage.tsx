import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { EmptyState, LoadingState } from '@/components/ui/Spinner'

export function GenresPage() {
  const [term, setTerm] = useState('')
  const { data: genres = [], isLoading } = useQuery({
    queryKey: ['genres'],
    queryFn: api.genres,
  })

  const visible = useMemo(() => {
    const query = term.trim().toLowerCase()
    return genres
      .filter((genre) => !query || genre.name.toLowerCase().includes(query))
      .slice()
      .sort((a, b) => b.songCount - a.songCount || a.name.localeCompare(b.name))
  }, [genres, term])

  return (
    <div>
      <h1 className="mb-4 text-3xl font-extrabold tracking-tight">Genres</h1>
      <input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Filter genres"
        aria-label="Filter genres"
        className="mb-6 h-10 w-full max-w-sm rounded-full border border-white/5 bg-white/[0.03] px-4 text-sm placeholder:text-zinc-500 focus:border-emerald-500/50 focus:outline-none"
      />
      {isLoading ? (
        <LoadingState />
      ) : visible.length === 0 ? (
        <EmptyState title="No genres" description="Songs pick up a genre from their tags." />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((genre) => (
            <li key={genre.name}>
              <Link
                to={`/genres/${encodeURIComponent(genre.name)}`}
                className="flex items-baseline justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 transition hover:bg-white/[0.07]"
              >
                <span className="truncate font-semibold">{genre.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {genre.albumCount} album{genre.albumCount === 1 ? '' : 's'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
