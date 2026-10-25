import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { PlayerBar } from '@/components/player/PlayerBar'
import { LyricsPanel } from '@/components/player/LyricsPanel'
import { ContextMenuProvider } from '@/components/ui/ContextMenu'

/**
 * The three-region shell: a fixed sidebar, a scrolling content column, and a
 * player bar pinned across the bottom.
 *
 * The panels float on the page background with a gap between them. Only the
 * content column scrolls, so the player never slides out of view.
 *
 * Below the md breakpoint the sidebar becomes an overlay drawer, since 240px of
 * permanent navigation would leave a phone with almost no content column.
 */
export function AppLayout() {
  const [navOpen, setNavOpen] = useState(false)
  const { pathname } = useLocation()

  // Following a link should dismiss the drawer, otherwise it covers the page the
  // user just asked for.
  useEffect(() => setNavOpen(false), [pathname])

  useEffect(() => {
    if (!navOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navOpen])

  return (
    <ContextMenuProvider>
    <div className="flex h-full min-w-0 flex-col gap-2 overflow-hidden p-2 sm:gap-3 sm:p-3">
      <TopBar onOpenNav={() => setNavOpen(true)} />
      <div className="flex min-h-0 min-w-0 flex-1 gap-2 sm:gap-3">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto rounded-2xl border border-white/5 bg-surface/90 shadow-2xl">
          <div className="relative px-4 py-6 md:px-8 md:pt-8 md:pb-12">
            <Outlet />
          </div>
        </main>
        <LyricsPanel />
      </div>
      <PlayerBar />
    </div>
    </ContextMenuProvider>
  )
}
