import { NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Disc3,
  Heart,
  Home,
  Music2,
  Plus,
  Settings,
  Tags,
  Users,
  X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { PlaylistMark, usePlaylistEditor } from '@/components/playlist/usePlaylistEditor'
import { useContextMenu } from '@/components/ui/ContextMenu'
import type { Playlist } from '@/lib/types'
import { Logo } from './Logo'

const navItems = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/albums', label: 'Albums', icon: Disc3 },
  { to: '/artists', label: 'Artists', icon: Users },
  { to: '/songs', label: 'Songs', icon: Music2 },
  { to: '/genres', label: 'Genres', icon: Tags },
  { to: '/favorites', label: 'Favorites', icon: Heart },
]

interface SidebarProps {
  /** Drawer state, only meaningful below the md breakpoint. */
  open: boolean
  onClose: () => void
}

function PlaylistLink({ playlist }: { playlist: Playlist }) {
  const { open } = useContextMenu()
  const { items, dialogs } = usePlaylistEditor(playlist)

  return (
    <li>
      <NavLink
        to={`/playlists/${playlist.id}`}
        onContextMenu={(event) => open(event, items)}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium transition',
            isActive
              ? 'bg-emerald-500/10 text-white'
              : 'text-zinc-400 hover:bg-white/5 hover:text-white',
          )
        }
      >
        <PlaylistMark
          playlist={playlist}
          iconClassName="h-3.5 w-3.5"
          className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/5 object-cover text-zinc-300"
        />
        <span className="truncate">{playlist.name}</span>
      </NavLink>
      {dialogs}
    </li>
  )
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const navigate = useNavigate()
  const { data: playlists = [], refetch } = useQuery({
    queryKey: ['playlists'],
    queryFn: api.playlists,
  })

  async function createPlaylist() {
    const name = window.prompt('Playlist name')
    if (!name?.trim()) return
    const { playlist } = await api.createPlaylist(name.trim())
    await refetch()
    navigate(`/playlists/${playlist.id}`)
  }

  return (
    <>
      {/* Tapping outside the drawer closes it. Desktop never shows the scrim. */}
      <div
        onClick={onClose}
        aria-hidden
        className={cn(
          'fixed inset-0 z-30 bg-black/60 transition-opacity md:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        className={cn(
          'flex w-64 shrink-0 flex-col justify-between border border-white/5 bg-surface/90 p-3.5 shadow-xl backdrop-blur-md',
          // Below md this is an overlay drawer rather than a column, because a
          // permanent sidebar leaves a phone no room to show anything.
          // invisible when closed also keeps its links out of the tab order.
          'max-md:fixed max-md:inset-y-2 max-md:left-2 max-md:z-40 max-md:rounded-2xl max-md:transition-[transform,visibility]',
          'md:rounded-2xl',
          open
            ? 'max-md:visible max-md:translate-x-0'
            : 'max-md:invisible max-md:-translate-x-[110%]',
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
          <div className="flex items-center gap-2 md:hidden">
            <Logo />
            <span className="text-lg font-bold tracking-tight">Freequence</span>
            <button
              onClick={onClose}
              aria-label="Close navigation"
              className="ml-auto text-muted transition-colors hover:text-fg"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex flex-col gap-1">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3.5 rounded-xl px-3 py-2.5 text-sm transition-all',
                    isActive
                      ? 'border border-emerald-500/30 bg-emerald-500/10 font-semibold text-white shadow-sm shadow-emerald-500/10'
                      : 'font-medium text-zinc-400 hover:bg-white/5 hover:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={cn(
                        'h-4 w-4 transition-transform group-hover:scale-110',
                        isActive && 'text-emerald-400',
                      )}
                    />
                    {label}
                    {isActive && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-white/5 pt-2">
            <div className="mb-2 flex items-center justify-between px-3">
              <span className="text-xs font-bold tracking-wider text-zinc-400 uppercase">Playlists</span>
              <button
                onClick={() => void createPlaylist()}
                aria-label="New playlist"
                className="grid h-6 w-6 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {playlists.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted">No playlists yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {playlists.map((playlist) => (
                  <PlaylistLink key={playlist.id} playlist={playlist} />
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="border-t border-white/5 pt-3">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                isActive
                  ? 'bg-emerald-500/10 text-white'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-white',
              )
            }
          >
            <Settings className="h-4 w-4" />
            Settings
          </NavLink>
        </div>
      </aside>
    </>
  )
}
