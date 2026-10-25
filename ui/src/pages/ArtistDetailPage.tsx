import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Play, Shuffle, User } from 'lucide-react'
import { api } from '@/lib/api'
import { formatTotalTime, shuffled } from '@/lib/utils'
import { usePlayer } from '@/store/playerStore'
import { AlbumGrid } from '@/components/AlbumCard'
import { CoverArt } from '@/components/CoverArt'
import { EmptyState, LoadingState } from '@/components/ui/Spinner'

export function ArtistDetailPage() {
  const { id = '' } = useParams()
  const playTracks = usePlayer((s) => s.playTracks)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['artist', id],
    queryFn: () => api.artist(id),
  })

  if (isLoading) return <LoadingState />
  if (isError || !data) return <EmptyState title="Artist not found" />

  const { artist, albums } = data
  const hasImage = Boolean(artist.coverArt)

  async function loadTracks() {
    const lists = await Promise.all(albums.map((album) => api.album(album.id)))
    return lists.flatMap((list) => list.tracks)
  }

  const backdrop = artist.coverArt

  return (
    <div className="space-y-10">
      {/* Negative margins cancel the panel padding so the photo wash reaches
          the edges of the content panel, then fades into it. */}
      <header className="relative -mx-4 -mt-6 overflow-hidden px-4 pt-8 pb-2 md:-mx-8 md:-mt-8 md:px-8 md:pt-10">
        {backdrop && (
          <>
            <img
              src={backdrop}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-45 blur-2xl"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-surface/30 via-surface/70 to-surface" />
          </>
        )}
        <div className="relative flex flex-col items-center gap-6 text-center md:flex-row md:items-end md:text-left">
          <CoverArt
            id={artist.id}
            src={artist.coverArt}
            hasArt={hasImage}
            alt={artist.name}
            eager
            fallback={<User className="h-16 w-16" strokeWidth={1.5} />}
            className="h-44 w-44 shrink-0 rounded-full shadow-2xl ring-4 ring-emerald-500/20 sm:h-52 sm:w-52"
          />
          <div className="min-w-0 space-y-3">
            <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Artist</p>
            <h1 className="text-4xl font-extrabold tracking-tight break-words text-white sm:text-6xl">
              {artist.name}
            </h1>
            <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-medium text-zinc-300 md:justify-start">
              <span>
                {artist.albumCount} album{artist.albumCount === 1 ? '' : 's'}
              </span>
              <span className="text-zinc-600">•</span>
              <span>
                {artist.songCount} track{artist.songCount === 1 ? '' : 's'}
              </span>
              <span className="text-zinc-600">•</span>
              <span>{formatTotalTime(artist.duration)}</span>
            </p>
          </div>
        </div>

        <div className="relative mt-8 flex items-center gap-4">
          <button
            onClick={() => void loadTracks().then((tracks) => playTracks(tracks))}
            disabled={albums.length === 0}
            aria-label={`Play ${artist.name}`}
            className="grid h-14 w-14 place-items-center rounded-full bg-accent text-[#08080a] shadow-lg shadow-emerald-500/30 transition hover:scale-105 hover:bg-accent-hover active:scale-95 disabled:opacity-40"
          >
            <Play className="h-6 w-6 translate-x-px" fill="currentColor" />
          </button>
          <button
            onClick={() => void loadTracks().then((tracks) => playTracks(shuffled(tracks)))}
            disabled={albums.length === 0}
            aria-label={`Shuffle ${artist.name}`}
            className="grid h-10 w-10 place-items-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white active:scale-95 disabled:opacity-40"
          >
            <Shuffle className="h-5 w-5" />
          </button>
        </div>
      </header>

      <section>
        <h2 className="mb-4 text-xl font-bold tracking-tight text-white">Discography</h2>
        <AlbumGrid albums={albums} />
      </section>
    </div>
  )
}
