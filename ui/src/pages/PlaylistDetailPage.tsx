import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Shuffle, Trash2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDuration, shuffled } from '@/lib/utils'
import { usePlayer } from '@/store/playerStore'
import { PlaylistMark, usePlaylistEditor } from '@/components/playlist/usePlaylistEditor'
import { useContextMenu } from '@/components/ui/ContextMenu'
import { TrackList } from '@/components/TrackList'
import { Button } from '@/components/ui/Button'
import { EmptyState, LoadingState } from '@/components/ui/Spinner'
import type { Playlist } from '@/lib/types'

export function PlaylistDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const playTracks = usePlayer((s) => s.playTracks)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['playlist', id],
    queryFn: () => api.playlist(id),
  })
  const { open } = useContextMenu()
  const editor = usePlaylistEditor(
    data?.playlist ??
      ({
        id,
        name: '',
        ownerId: '',
        owner: '',
        public: false,
        songCount: 0,
        duration: 0,
        createdAt: '',
        updatedAt: '',
      } satisfies Playlist),
  )

  if (isLoading) return <LoadingState />
  if (isError || !data) return <EmptyState title="Playlist not found" />

  const { playlist, tracks } = data

  async function removeAt(index: number) {
    await api.removeFromPlaylist(id, [index])
    await refetch()
  }

  async function reorder(from: number, to: number) {
    if (from === to || to < 0 || to >= tracks.length) return
    const next = tracks.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    await api.reorderPlaylist(id, next.map((track) => track.id))
    await refetch()
  }

  async function deletePlaylist() {
    if (!window.confirm(`Delete "${playlist.name}"? This cannot be undone.`)) return
    await api.deletePlaylist(id)
    await queryClient.invalidateQueries({ queryKey: ['playlists'] })
    navigate('/', { replace: true })
  }

  return (
    <div>
      {editor.dialogs}
      <header
        className="mb-8 flex items-end gap-6"
        onContextMenu={(event) => open(event, editor.items)}
      >
        <PlaylistMark
          playlist={playlist}
          iconClassName="h-16 w-16"
          className="grid h-44 w-44 shrink-0 place-items-center overflow-hidden rounded-lg bg-elevated object-cover text-muted shadow-2xl"
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Playlist</p>
          <h1 className="mt-1 text-4xl font-extrabold tracking-tight break-words sm:text-5xl">{playlist.name}</h1>
          <p className="mt-3 text-sm text-muted">
            {playlist.owner} · {playlist.songCount} songs · {formatDuration(playlist.duration)}
          </p>
        </div>
      </header>

      <div className="mb-6 flex items-center gap-3">
        <Button
          variant="primary"
          size="lg"
          disabled={tracks.length === 0}
          onClick={() => playTracks(tracks)}
        >
          <Play className="h-5 w-5" fill="currentColor" />
          Play
        </Button>
        <Button
          size="lg"
          disabled={tracks.length === 0}
          onClick={() => playTracks(shuffled(tracks))}
        >
          <Shuffle className="h-4 w-4" />
          Shuffle
        </Button>
        <Button variant="ghost" size="icon" onClick={() => void deletePlaylist()} title="Delete playlist">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {tracks.length === 0 ? (
        <EmptyState
          title="This playlist is empty"
          description="Open a song and use Add to playlist."
        />
      ) : (
        <TrackList
          tracks={tracks}
          onStarChanged={() => void refetch()}
          onReorder={(from, to) => void reorder(from, to)}
          onRemove={(index) => void removeAt(index)}
          excludePlaylistId={id}
          rowAction={(_, index) => (
            <button
              onClick={() => void removeAt(index)}
              aria-label="Remove from playlist"
              className="p-1 text-muted hover:text-fg md:opacity-0 md:group-hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        />
      )}
    </div>
  )
}
