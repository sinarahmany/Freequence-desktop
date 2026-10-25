import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, LogOut, Menu, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { useSession } from '@/hooks/useSession'
import { Logo } from './Logo'

export function TopBar({ onOpenNav }: { onOpenNav: () => void }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { session, clear } = useSession()
  const [term, setTerm] = useState(searchParams.get('q') ?? '')

  // Typing navigates to the search page, but only after the user pauses, so a
  // query is not fired for every keystroke.
  useEffect(() => {
    const trimmed = term.trim()
    const timer = window.setTimeout(() => {
      if (trimmed) navigate(`/search?q=${encodeURIComponent(trimmed)}`, { replace: true })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [term, navigate])

  async function signOut() {
    await api.logout().catch(() => undefined)
    clear()
  }

  return (
    <header className="flex h-14 w-full shrink-0 items-center gap-3 px-1">
      <div className="flex w-auto items-center gap-3 md:w-64">
        <button
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/5 bg-surface text-muted transition hover:bg-hover hover:text-fg md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Logo className="hidden md:flex" />
        <span className="hidden bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-lg font-bold tracking-tight text-transparent md:inline">
          Freequence
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
        {/* Phones have a system back gesture, so these only earn their space on
            a desktop where the window has no chrome of its own. */}
        <div className="hidden gap-1 text-zinc-400 md:flex">
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/5 bg-surface transition hover:bg-hover hover:text-white active:scale-95"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate(1)}
            aria-label="Go forward"
            className="grid h-8 w-8 place-items-center rounded-full border border-white/5 bg-surface transition hover:bg-hover hover:text-white active:scale-95"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <label className="group relative min-w-0 flex-1 max-w-xl">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-zinc-400 transition-colors group-focus-within:text-emerald-400" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search artists, tracks, or albums"
            aria-label="Search the library"
            className="h-10 w-full rounded-full border border-white/5 bg-surface pr-4 pl-10 text-sm text-zinc-100 shadow-inner transition duration-200 placeholder:text-zinc-500 hover:bg-elevated focus:border-emerald-500/50 focus:bg-elevated focus:outline-none"
          />
        </label>
      </div>

      <div className="flex shrink-0 items-center justify-end md:w-64">
        <button
          onClick={() => void signOut()}
          title="Sign out"
          className="flex items-center gap-2 rounded-full border border-white/5 bg-surface p-1.5 transition hover:bg-hover active:scale-95"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-400 ring-1 ring-white/10">
            {(session?.user.username?.[0] ?? '?').toUpperCase()}
          </span>
          <span className="hidden pr-1 text-xs font-semibold text-zinc-200 md:inline">
            {session?.user.username}
          </span>
          <LogOut className="mr-1 hidden h-3.5 w-3.5 text-zinc-400 md:inline" />
        </button>
      </div>
    </header>
  )
}
