import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Folder, FolderPlus, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useSession } from '@/hooks/useSession'
import { Button } from '@/components/ui/Button'

/**
 * The folder picker and the list of folders already in the library.
 *
 * The built-in music folder is always there. Everything else is a folder the
 * user already had on the computer; adding it does not copy the files.
 */
export function MusicFoldersCard() {
  const { session } = useSession()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const isAdmin = session?.user.isAdmin ?? false

  const { data, refetch } = useQuery({
    queryKey: ['libraryFolders'],
    queryFn: api.folders,
    enabled: isAdmin,
  })

  const { data: status } = useQuery({
    queryKey: ['scanStatus'],
    queryFn: api.scanStatus,
    refetchInterval: (query) => (query.state.data?.scanning ? 1000 : false),
    enabled: isAdmin,
  })

  const wasScanning = useRef(false)
  useEffect(() => {
    if (status?.scanning) {
      wasScanning.current = true
      return
    }
    if (!wasScanning.current) return
    wasScanning.current = false
    void queryClient.invalidateQueries({ queryKey: ['stats'] })
    void queryClient.invalidateQueries({ queryKey: ['albums'] })
    void queryClient.invalidateQueries({ queryKey: ['artists'] })
    void queryClient.invalidateQueries({ queryKey: ['tracks'] })
  }, [status?.scanning, queryClient])

  async function remove(id: string) {
    await api.removeFolder(id)
    await refetch()
  }

  if (!isAdmin) return null

  return (
    <section className="mb-8">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Music Folders</h2>
          <p className="mt-1 text-sm text-muted">
            Directories monitored for audio files. The files stay where they are.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setOpen(true)}
          disabled={!data?.canBrowse}
          className="self-start"
        >
          <FolderPlus className="h-4 w-4" />
          Add Folder
        </Button>
      </div>

      {data && !data.canBrowse && (
        <p className="mb-4 text-sm text-muted">
          This computer’s folders aren’t visible to the server yet.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {(data?.folders ?? []).map((folder) => (
          <li
            key={folder.id ?? 'builtin'}
            className="flex items-center gap-4 rounded-xl border border-line bg-elevated px-4 py-3.5"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Folder className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">{folder.name}</p>
                {folder.builtin && (
                  <span className="shrink-0 rounded-full bg-hover px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted uppercase">
                    Internal
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted">{folder.label}</p>
            </div>
            {folder.id && (
              <button
                onClick={() => void remove(folder.id!)}
                className="shrink-0 text-sm text-muted hover:text-fg"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      {open && (
        <FolderPicker
          onClose={() => setOpen(false)}
          onAdded={() => {
            setOpen(false)
            void refetch()
          }}
        />
      )}
    </section>
  )
}

function FolderPicker({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [path, setPath] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['browse', path],
    queryFn: () => api.browse(path),
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function add() {
    if (!data?.path) return
    setSaving(true)
    setError('')
    try {
      await api.addFolder(data.path)
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that folder')
      setSaving(false)
    }
  }

  const crumbs = (data?.label ?? '').split('/').filter(Boolean)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="folder-picker-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[min(40rem,100dvh)] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface sm:max-w-lg sm:rounded-2xl"
      >
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h3 id="folder-picker-title" className="text-base font-semibold">
              Choose a folder
            </h3>
            <p className="truncate text-xs text-muted">
              {data?.label || 'Folders'}
              <span className="text-muted"> · files stay where they are</span>
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 text-muted hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </header>

        {crumbs.length > 1 && (
          <div className="flex gap-1 overflow-x-auto px-4 py-2 text-xs text-muted">
            {crumbs.map((crumb, index) => (
              <span key={crumb} className="shrink-0">
                {index > 0 && <span className="px-1">/</span>}
                <span className={index === crumbs.length - 1 ? 'text-fg' : undefined}>{crumb}</span>
              </span>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {data?.parent && data.path !== '' && (
            <button
              onClick={() => setPath(data.parent ?? '')}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-muted hover:bg-hover"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
              Back
            </button>
          )}
          {isLoading && <p className="px-4 py-8 text-center text-sm text-muted">Opening…</p>}
          {isError && (
            <p className="px-4 py-8 text-center text-sm text-muted">That folder can’t be opened.</p>
          )}
          {data && data.entries.length === 0 && !isLoading && (
            <p className="px-4 py-8 text-center text-sm text-muted">No folders in here</p>
          )}
          {data?.entries.map((entry) => (
            <button
              key={entry.path}
              onClick={() => setPath(entry.path)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover"
            >
              <Folder className="h-4 w-4 shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
            </button>
          ))}
        </div>

        <footer className="flex flex-col gap-3 border-t border-line px-4 py-3">
          {error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : (
            !data?.canAdd && <p className="text-xs text-muted">Open the folder that has your songs.</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void add()} disabled={!data?.canAdd || saving}>
              {saving ? 'Adding…' : 'Add this folder'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
