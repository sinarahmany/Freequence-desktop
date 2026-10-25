import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Download, GripVertical, Heart, Music2, Play } from 'lucide-react'
import { api, downloadUrl } from '@/lib/api'
import { cn, formatDuration } from '@/lib/utils'
import { usePlayer } from '@/store/playerStore'
import { AddToPlaylist } from './playlist/AddToPlaylist'
import { useContextMenu, type MenuItem } from './ui/ContextMenu'
import { CoverArt } from './CoverArt'
import type { Track } from '@/lib/types'

interface TrackListProps {
  tracks: Track[]
  /** Album view numbers its rows; mixed lists show artwork instead. */
  variant?: 'album' | 'mixed'
  onStarChanged?: () => void
  /** Moves a row from one index to another. Present only on a playlist. */
  onReorder?: (from: number, to: number) => void
  /** Hide this playlist in each row's add menu. The songs are already on it. */
  excludePlaylistId?: string
  /** Removes the row from the playlist being viewed. */
  onRemove?: (index: number) => void
  /** Rendered at the end of each row, for playlist removal and similar actions. */
  rowAction?: (track: Track, index: number) => React.ReactNode
}

export function TrackList({
  tracks,
  variant = 'mixed',
  onStarChanged,
  onReorder,
  excludePlaylistId,
  onRemove,
  rowAction,
}: TrackListProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { open } = useContextMenu()
  const { data: playlists = [] } = useQuery({
    queryKey: ['playlists'],
    queryFn: api.playlists,
  })
  const playTracks = usePlayer((s) => s.playTracks)
  const currentId = usePlayer((s) => s.queue[s.index]?.id)
  const isPlaying = usePlayer((s) => s.isPlaying)
  const syncStarred = usePlayer((s) => s.syncStarred)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  function trackMenu(track: Track, index: number): MenuItem[] {
    const addable = playlists.filter((playlist) => playlist.id !== excludePlaylistId)
    const items: MenuItem[] = [
      { label: 'Play', onClick: () => playTracks(tracks, index) },
      {
        label: track.starred ? 'Remove from favourites' : 'Add to favourites',
        onClick: () => void toggleStar(track),
      },
      {
        label: 'Add to playlist',
        children: [
          ...addable.map((playlist) => ({
            label: playlist.name,
            onClick: () => {
              void api.addToPlaylist(playlist.id, [track.id]).then(() =>
                queryClient.invalidateQueries({ queryKey: ['playlists'] }),
              )
              void queryClient.invalidateQueries({ queryKey: ['playlist', playlist.id] })
            },
          })),
          {
            label: 'New playlist',
            onClick: () => {
              const name = window.prompt('Playlist name')
              if (!name?.trim()) return
              void api.createPlaylist(name.trim(), [track.id]).then(() =>
                queryClient.invalidateQueries({ queryKey: ['playlists'] }),
              )
            },
          },
        ],
      },
      { label: 'Go to album', onClick: () => navigate(`/albums/${track.albumId}`) },
      { label: 'Go to artist', onClick: () => navigate(`/artists/${track.artistId}`) },
      { label: 'Download', onClick: () => downloadTrack(track) },
    ]
    if (onRemove) {
      items.push({ label: 'Remove from playlist', danger: true, onClick: () => onRemove(index) })
    }
    return items
  }

  function downloadTrack(track: Track) {
    const link = document.createElement('a')
    link.href = downloadUrl(track.id)
    link.download = ''
    link.click()
  }

  async function toggleStar(track: Track) {
    await api.star(track.id, 'track', !track.starred)
    syncStarred(track.id, !track.starred)
    onStarChanged?.()
  }

  return (
    <ul className="divide-y divide-white/[0.04] rounded-xl border border-white/5 bg-white/[0.03]">
      {tracks.map((track, index) => {
        const active = track.id === currentId
        return (
          <li
            key={`${track.id}-${index}`}
            onContextMenu={(event) => open(event, trackMenu(track, index))}
            onDragOver={
              onReorder
                ? (event) => {
                    event.preventDefault()
                    setDragOver(index)
                  }
                : undefined
            }
            onDrop={
              onReorder
                ? (event) => {
                    event.preventDefault()
                    const from = Number(event.dataTransfer.getData('text/plain'))
                    if (!Number.isNaN(from)) onReorder(from, index)
                    setDragFrom(null)
                    setDragOver(null)
                  }
                : undefined
            }
            className={cn(
              'group grid items-center gap-3 px-3 py-3 hover:bg-white/[0.06] sm:px-4',
              onReorder
                ? variant === 'mixed'
                  ? 'grid-cols-[1.5rem_2.5rem_1fr_auto]'
                  : 'grid-cols-[1.5rem_2rem_1fr_auto]'
                : variant === 'mixed'
                  ? 'grid-cols-[2.5rem_1fr_auto]'
                  : 'grid-cols-[2rem_1fr_auto]',
              active && 'bg-white/[0.04]',
              dragOver === index && dragFrom !== index && 'bg-white/10',
            )}
          >
            {onReorder && (
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  draggable
                  aria-label={`Drag ${track.title}`}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', String(index))
                    setDragFrom(index)
                  }}
                  onDragEnd={() => {
                    setDragFrom(null)
                    setDragOver(null)
                  }}
                  className="cursor-grab text-muted active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
                <span className="flex flex-col md:hidden">
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={index === 0}
                    onClick={() => onReorder(index, index - 1)}
                    className="text-muted disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={index === tracks.length - 1}
                    onClick={() => onReorder(index, index + 1)}
                    className="text-muted disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            )}
            <button
              onClick={() => playTracks(tracks, index)}
              aria-label={`Play ${track.title}`}
              className="grid h-full place-items-center text-sm text-muted"
            >
              {variant === 'album' ? (
                <>
                  <span className="group-hover:hidden">
                    {active && isPlaying ? (
                      <Music2 className="h-4 w-4 text-accent" />
                    ) : (
                      track.trackNumber || index + 1
                    )}
                  </span>
                  <Play className="hidden h-4 w-4 text-fg group-hover:block" fill="currentColor" />
                </>
              ) : (
                <span className="relative">
                  <CoverArt
                    id={track.albumId}
                    hasArt={track.hasCoverArt}
                    alt={track.album}
                    className="h-10 w-10 rounded"
                  />
                  <span className="absolute inset-0 hidden place-items-center rounded bg-black/60 group-hover:grid">
                    <Play className="h-4 w-4 text-fg" fill="currentColor" />
                  </span>
                </span>
              )}
            </button>

            <div className="min-w-0">
              <p className={cn('truncate text-sm font-semibold', active && 'text-accent')}>
                {track.title}
              </p>
              <p className="truncate text-xs text-muted">
                <Link to={`/artists/${track.artistId}`} className="hover:underline">
                  {track.artist}
                </Link>
                {variant === 'mixed' && track.album && (
                  <>
                    {' · '}
                    <Link to={`/albums/${track.albumId}`} className="hover:underline">
                      {track.album}
                    </Link>
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <AddToPlaylist trackId={track.id} excludePlaylistId={excludePlaylistId} />
              <a
                href={downloadUrl(track.id)}
                download
                aria-label={`Download ${track.title}`}
                className="text-muted hover:text-fg md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                onClick={() => void toggleStar(track)}
                aria-label={track.starred ? 'Remove from favourites' : 'Add to favourites'}
                className={cn(
                  'text-muted transition-opacity hover:text-fg',
                  // Only hidden-until-hover where hover exists; on touch it would
                  // simply never appear.
                  !track.starred &&
                    'md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100',
                )}
              >
                <Heart
                  className={cn('h-4 w-4', track.starred && 'text-accent')}
                  fill={track.starred ? 'currentColor' : 'none'}
                />
              </button>
              <span className="w-10 text-right text-xs tabular-nums text-muted">
                {formatDuration(track.duration)}
              </span>
              {rowAction?.(track, index)}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
