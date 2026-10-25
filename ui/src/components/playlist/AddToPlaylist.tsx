import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ListPlus, Plus } from 'lucide-react'
import { api } from '@/lib/api'

/** Appends one song to a playlist the person already has, or to a new one. */
export function AddToPlaylist({
  trackId,
  excludePlaylistId,
}: {
  trackId: string
  /** Playlist this song is already on, so it is not offered again. */
  excludePlaylistId?: string
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const { data: playlists = [] } = useQuery({
    queryKey: ['playlists'],
    queryFn: api.playlists,
    enabled: open,
  })
  const choices = playlists.filter((playlist) => playlist.id !== excludePlaylistId)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function add(playlistId: string, name: string) {
    await api.addToPlaylist(playlistId, [trackId])
    await queryClient.invalidateQueries({ queryKey: ['playlists'] })
    await queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] })
    setOpen(false)
    setNotice(name)
    window.setTimeout(() => setNotice(''), 1600)
  }

  async function createAndAdd() {
    const name = window.prompt('Playlist name')
    if (!name?.trim()) return
    const { playlist } = await api.createPlaylist(name.trim(), [trackId])
    await queryClient.invalidateQueries({ queryKey: ['playlists'] })
    setOpen(false)
    setNotice(playlist.name)
    window.setTimeout(() => setNotice(''), 1600)
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label={notice ? `Added to ${notice}` : 'Add to playlist'}
        aria-expanded={open}
        title={notice ? `Added to ${notice}` : 'Add to playlist'}
        onClick={() => setOpen((value) => !value)}
        className="p-1 text-muted hover:text-fg"
      >
        {notice ? <Check className="h-4 w-4 text-accent" /> : <ListPlus className="h-4 w-4" />}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-lg border border-white/10 bg-surface py-1 shadow-xl"
        >
          <p className="px-3 py-1.5 text-[11px] font-bold tracking-wider text-zinc-400 uppercase">
            Add to playlist
          </p>
          {choices.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted">
              {excludePlaylistId ? 'No other playlists yet.' : 'No playlists yet.'}
            </p>
          )}
          {choices.map((playlist) => (
            <button
              key={playlist.id}
              type="button"
              role="menuitem"
              onClick={() => void add(playlist.id, playlist.name)}
              className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-white/5"
            >
              {playlist.name}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => void createAndAdd()}
            className="flex w-full items-center gap-2 border-t border-white/5 px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/5"
          >
            <Plus className="h-3.5 w-3.5" />
            New playlist
          </button>
        </div>
      )}
    </div>
  )
}
