import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ListMusic } from 'lucide-react'
import { api } from '@/lib/api'
import { usePlayer } from '@/store/playerStore'
import type { MenuItem } from '@/components/ui/ContextMenu'
import type { Playlist } from '@/lib/types'

/** Rename, picture and delete for one playlist, shared by the sidebar and the playlist page. */
export function usePlaylistEditor(playlist: Playlist) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const playTracks = usePlayer((s) => s.playTracks)
  const fileRef = useRef<HTMLInputElement>(null)
  const [renaming, setRenaming] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['playlists'] })
    await queryClient.invalidateQueries({ queryKey: ['playlist', playlist.id] })
  }

  async function play() {
    const { tracks } = await api.playlist(playlist.id)
    if (tracks.length > 0) playTracks(tracks)
  }

  async function remove() {
    if (!window.confirm(`Delete "${playlist.name}"? This cannot be undone.`)) return
    await api.deletePlaylist(playlist.id)
    await queryClient.invalidateQueries({ queryKey: ['playlists'] })
    if (location.pathname === `/playlists/${playlist.id}`) navigate('/', { replace: true })
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    try {
      await api.uploadPlaylistCover(playlist.id, file)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the image')
    }
  }

  async function clearCover() {
    setError('')
    try {
      await api.clearPlaylistCover(playlist.id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the image')
    }
  }

  const items: MenuItem[] = [
    { label: 'Play', disabled: playlist.songCount === 0, onClick: () => void play() },
    { label: 'Rename', onClick: () => setRenaming(true) },
    { label: 'Change image', onClick: () => fileRef.current?.click() },
    ...(playlist.coverArt ? [{ label: 'Remove image', onClick: () => void clearCover() }] : []),
    { label: 'Delete', danger: true, onClick: () => void remove() },
  ]

  const dialogs = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(event) => void onFile(event)}
      />
      {renaming && (
        <RenameDialog
          name={playlist.name}
          onClose={() => setRenaming(false)}
          onSave={async (name) => {
            await api.renamePlaylist(playlist.id, name)
            await refresh()
            setRenaming(false)
          }}
        />
      )}
      {error && (
        <button
          type="button"
          onClick={() => setError('')}
          className="fixed bottom-24 left-1/2 z-[90] -translate-x-1/2 rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-red-400 shadow-xl"
        >
          {error}
        </button>
      )}
    </>
  )

  return { items, dialogs }
}

function RenameDialog({
  name,
  onClose,
  onSave,
}: {
  name: string
  onClose: () => void
  onSave: (name: string) => Promise<void>
}) {
  const [value, setValue] = useState(name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const next = value.trim()
    if (!next) {
      setError('A playlist needs a name')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename the playlist')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <form
        onSubmit={(event) => void submit(event)}
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-white/10 bg-surface p-4 shadow-2xl"
      >
        <h2 className="text-lg font-semibold">Rename playlist</h2>
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="mt-3 h-11 w-full rounded-lg border border-line bg-base px-3 text-sm focus:outline-2 focus:outline-offset-1 focus:outline-accent"
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-fg">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-[#08080a] disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  )
}

/** Small playlist picture, or the list mark when the playlist has none. */
export function PlaylistMark({
  playlist,
  className,
  iconClassName = 'h-3.5 w-3.5',
}: {
  playlist: Playlist
  className: string
  iconClassName?: string
}) {
  if (!playlist.coverArt) {
    return (
      <span className={className}>
        <ListMusic className={iconClassName} />
      </span>
    )
  }
  return <img src={playlist.coverArt} alt="" className={className} />
}
