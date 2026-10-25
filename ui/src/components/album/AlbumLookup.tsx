import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Image as ImageIcon, MoreHorizontal, Tags, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { Album, AlbumSuggestion, CoverSuggestion } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

/**
 * Looks up a better identity or cover for one album and shows the matches
 * before anything in the library changes.
 */
export function AlbumLookup({
  album,
  requested,
  onRequested,
}: {
  album: Album
  /** Opens the lookup from somewhere else, such as a right-click menu. */
  requested?: 'info' | 'cover' | null
  onRequested?: () => void
}) {
  const [mode, setMode] = useState<'info' | 'cover' | null>(null)
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!requested) return
    setMode(requested)
    onRequested?.()
  }, [requested])

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

  function choose(next: 'info' | 'cover') {
    setOpen(false)
    setMode(next)
  }

  return (
    <div ref={menuRef} className="relative ml-auto">
      <button
        type="button"
        aria-label="Album options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-hover hover:text-fg"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => choose('info')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-hover"
          >
            <Tags className="h-4 w-4" />
            Fix info
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => choose('cover')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-hover"
          >
            <ImageIcon className="h-4 w-4" />
            Change cover
          </button>
        </div>
      )}
      {mode && <LookupDialog album={album} mode={mode} onClose={() => setMode(null)} />}
    </div>
  )
}

function LookupDialog({
  album,
  mode,
  onClose,
}: {
  album: Album
  mode: 'info' | 'cover'
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [picked, setPicked] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const info = useQuery({
    queryKey: ['album-metadata', album.id],
    queryFn: () => api.albumMetadata(album.id),
    enabled: mode === 'info',
  })
  const covers = useQuery({
    queryKey: ['album-covers', album.id],
    queryFn: () => api.albumCovers(album.id),
    enabled: mode === 'cover',
  })

  const loading = mode === 'info' ? info.isLoading : covers.isLoading
  const failed = mode === 'info' ? info.isError : covers.isError
  const suggestions = mode === 'info' ? (info.data?.suggestions ?? []) : (covers.data?.suggestions ?? [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  async function approve() {
    if (picked === null) return
    setSaving(true)
    setError('')
    try {
      if (mode === 'info') {
        await api.applyAlbumMetadata(album.id, suggestions[picked] as AlbumSuggestion)
      } else {
        await api.applyAlbumCover(album.id, (suggestions[picked] as CoverSuggestion).imageUrl)
      }
      await queryClient.invalidateQueries({ queryKey: ['album', album.id] })
      await queryClient.invalidateQueries({ queryKey: ['albums'] })
      await queryClient.invalidateQueries({ queryKey: ['artists'] })
      await queryClient.invalidateQueries({ queryKey: ['tracks'] })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that')
      setSaving(false)
    }
  }

  const title = mode === 'info' ? 'Fix album info' : 'Change cover'
  const empty =
    mode === 'info'
      ? 'Nothing matched this album. The tags may not be enough to search on.'
      : 'No covers turned up for this album.'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      onMouseDown={() => {
        if (!saving) onClose()
      }}
    >
      <div
        role="dialog"
        aria-labelledby="album-lookup-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[min(40rem,100dvh)] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface sm:max-w-lg sm:rounded-2xl"
      >
        <header className="flex items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h3 id="album-lookup-title" className="text-base font-semibold">
              {title}
            </h3>
            <p className="mt-1 text-xs text-muted">
              Now: {album.artist} — {album.name}
              {album.year ? ` · ${album.year}` : ''}
            </p>
            <p className="mt-1 text-xs text-muted">Nothing changes until you approve a match.</p>
          </div>
          <button onClick={onClose} aria-label="Close" disabled={saving} className="p-2 text-muted hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading && <p className="px-3 py-10 text-center text-sm text-muted">Looking this album up…</p>}
          {failed && (
            <p className="px-3 py-10 text-center text-sm text-muted">The lookup didn’t answer. Try again in a moment.</p>
          )}
          {!loading && !failed && suggestions.length === 0 && (
            <p className="px-3 py-10 text-center text-sm text-muted">{empty}</p>
          )}
          {mode === 'info' &&
            (suggestions as AlbumSuggestion[]).map((hit, index) => (
              <button
                key={`${hit.artist}-${hit.name}-${index}`}
                onClick={() => setPicked(index)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-hover',
                  picked === index && 'bg-hover ring-1 ring-accent',
                )}
              >
                {hit.coverUrl ? (
                  <img src={hit.coverUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                ) : (
                  <span className="h-12 w-12 shrink-0 rounded bg-elevated" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{hit.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {hit.artist}
                    {hit.year ? ` · ${hit.year}` : ''}
                    {hit.genre ? ` · ${hit.genre}` : ''}
                  </span>
                </span>
              </button>
            ))}
          {mode === 'cover' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(suggestions as CoverSuggestion[]).map((hit, index) => (
                <button
                  key={hit.imageUrl}
                  onClick={() => setPicked(index)}
                  className={cn(
                    'overflow-hidden rounded-lg text-left hover:bg-hover',
                    picked === index && 'ring-2 ring-accent',
                  )}
                >
                  <img src={hit.imageUrl} alt="" className="aspect-square w-full object-cover" />
                  <span className="block truncate px-2 py-2 text-xs font-medium">{hit.name}</span>
                  <span className="block truncate px-2 pb-2 text-xs text-muted">{hit.artist}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <footer className="flex flex-col gap-3 border-t border-line px-4 py-3">
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void approve()} disabled={picked === null || saving}>
              {saving ? 'Saving…' : mode === 'info' ? 'Use this info' : 'Use this cover'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
