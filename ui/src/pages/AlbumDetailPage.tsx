import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Heart, Play, Shuffle } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatDuration, shuffled } from '@/lib/utils'
import { usePlayer } from '@/store/playerStore'
import { AlbumLookup } from '@/components/album/AlbumLookup'
import { useContextMenu } from '@/components/ui/ContextMenu'
import { CoverArt } from '@/components/CoverArt'
import { TrackList } from '@/components/TrackList'
import { EmptyState, LoadingState } from '@/components/ui/Spinner'

export function AlbumDetailPage() {
  const { id = '' } = useParams()
  const playTracks = usePlayer((s) => s.playTracks)
  const { open } = useContextMenu()
  const [lookup, setLookup] = useState<'info' | 'cover' | null>(null)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['album', id],
    queryFn: () => api.album(id),
  })

  if (isLoading) return <LoadingState />
  if (isError || !data) return <EmptyState title="Album not found" />

  const { album, tracks } = data

  async function toggleStar() {
    await api.star(album.id, 'album', !album.starred)
    await refetch()
  }

  return (
    <div>
      <header
        className="mb-8 flex flex-col items-center gap-6 text-center sm:flex-row sm:items-end sm:text-left"
        onContextMenu={(event) =>
          open(event, [
            { label: 'Play', onClick: () => playTracks(tracks) },
            { label: 'Shuffle', onClick: () => playTracks(shuffled(tracks)) },
            {
              label: album.starred ? 'Remove from favourites' : 'Add to favourites',
              onClick: () => void toggleStar(),
            },
            { label: 'Fix info', onClick: () => setLookup('info') },
            { label: 'Change cover', onClick: () => setLookup('cover') },
          ])
        }
      >
        <CoverArt
          id={album.id}
          src={album.coverArt}
          hasArt={album.hasCoverArt}
          alt={album.name}
          eager
          className="h-44 w-44 shrink-0 rounded-xl shadow-2xl ring-1 ring-white/10 sm:h-52 sm:w-52"
        />
        <div className="w-full min-w-0 space-y-3">
          <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Album</p>
          <h1 className="text-4xl font-extrabold tracking-tight break-words text-white sm:text-6xl">
            {album.name}
          </h1>
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-medium text-zinc-300 sm:justify-start">
            <Link to={`/artists/${album.artistId}`} className="font-semibold text-white hover:underline">
              {album.artist}
            </Link>
            {album.year ? (
              <>
                <span className="text-zinc-600">•</span>
                <span>{album.year}</span>
              </>
            ) : null}
            {album.genre ? (
              <>
                <span className="text-zinc-600">•</span>
                <span>{album.genre}</span>
              </>
            ) : null}
            <span className="text-zinc-600">•</span>
            <span>
              {album.songCount} song{album.songCount === 1 ? '' : 's'}, {formatDuration(album.duration)}
            </span>
          </p>
        </div>
      </header>

      <div className="mb-8 flex flex-wrap items-center gap-4">
        <button
          onClick={() => playTracks(tracks)}
          aria-label={`Play ${album.name}`}
          className="grid h-14 w-14 place-items-center rounded-full bg-accent text-[#08080a] shadow-lg shadow-emerald-500/30 transition hover:scale-105 hover:bg-accent-hover active:scale-95"
        >
          <Play className="h-6 w-6 translate-x-px" fill="currentColor" />
        </button>
        <button
          onClick={() => playTracks(shuffled(tracks))}
          aria-label={`Shuffle ${album.name}`}
          className="grid h-10 w-10 place-items-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white active:scale-95"
        >
          <Shuffle className="h-5 w-5" />
        </button>
        <button
          onClick={() => void toggleStar()}
          aria-label={album.starred ? 'Remove from favourites' : 'Add to favourites'}
          className="ml-1 text-muted hover:text-fg"
        >
          <Heart
            className={cn('h-6 w-6', album.starred && 'text-accent')}
            fill={album.starred ? 'currentColor' : 'none'}
          />
        </button>
        <AlbumLookup album={album} requested={lookup} onRequested={() => setLookup(null)} />
      </div>

      <TrackList tracks={tracks} variant="album" onStarChanged={() => void refetch()} />
    </div>
  )
}
