import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export interface MenuItem {
  label: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  children?: MenuItem[]
}

interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

const MenuContext = createContext<((event: { preventDefault(): void; clientX: number; clientY: number }, items: MenuItem[]) => void) | null>(null)

/** Opens the one shared right-click menu. */
export function useContextMenu() {
  const open = useContext(MenuContext)
  if (!open) throw new Error('useContextMenu must be used inside ContextMenuProvider')
  return { open }
}

export function ContextMenuProvider({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const open = useCallback((event: { preventDefault(): void; clientX: number; clientY: number }, items: MenuItem[]) => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY, items })
  }, [])

  return (
    <MenuContext.Provider value={open}>
      {children}
      {menu && <MenuPanel menu={menu} onClose={() => setMenu(null)} />}
    </MenuContext.Provider>
  )
}

function MenuPanel({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: menu.x, y: menu.y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({
      x: Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8)),
    })
  }, [menu])

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onScroll = () => onClose()
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[80] min-w-44 overflow-visible rounded-lg border border-white/10 bg-surface py-1 shadow-xl"
    >
      {menu.items.map((item) => (
        <MenuEntry key={item.label} item={item} onClose={onClose} openLeft={menu.x > window.innerWidth - 280} />
      ))}
    </div>,
    document.body,
  )
}

function MenuEntry({
  item,
  onClose,
  openLeft,
}: {
  item: MenuItem
  onClose: () => void
  openLeft: boolean
}) {
  const [open, setOpen] = useState(false)

  if (item.children) {
    return (
      <div className="relative">
        <button
          type="button"
          role="menuitem"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-4 px-3 py-2 text-left text-sm hover:bg-white/5"
        >
          {item.label}
          <span className="text-muted">{openLeft ? '‹' : '›'}</span>
        </button>
        {open && (
          <div
            role="menu"
            className={cn(
              'absolute top-0 z-[81] max-h-64 w-52 overflow-y-auto rounded-lg border border-white/10 bg-surface py-1 shadow-xl',
              openLeft ? 'right-full mr-1' : 'left-full ml-1',
            )}
          >
            {item.children.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted">Nothing here.</p>
            )}
            {item.children.map((child) => (
              <MenuEntry key={child.label} item={child} onClose={onClose} openLeft={openLeft} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onClick={() => {
        item.onClick?.()
        onClose()
      }}
      className={cn(
        'block w-full px-3 py-2 text-left text-sm hover:bg-white/5 disabled:opacity-40',
        item.danger ? 'text-red-400' : 'text-fg',
      )}
    >
      {item.label}
    </button>
  )
}
