import { useEffect } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlayer } from '@/store/playerStore'
import { Button } from '@/components/ui/Button'

/** The upcoming songs, opened from the player. The current row can be removed or moved. */
export function QueuePanel({ onClose }: { onClose: () => void }) {
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const playTrackAt = usePlayer((s) => s.playTrackAt)
  const removeFromQueue = usePlayer((s) => s.removeFromQueue)
  const moveInQueue = usePlayer((s) => s.moveInQueue)
  const clearQueue = usePlayer((s) => s.clearQueue)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="absolute right-0 bottom-full z-30 mb-2 flex max-h-[min(28rem,70vh)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-elevated shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
        <div>
          <p className="font-semibold">Queue</p>
          <p className="text-xs text-muted">
            {queue.length === 0 ? 'Nothing queued' : `${queue.length} song${queue.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={queue.length === 0}
            onClick={() => {
              clearQueue()
              onClose()
            }}
          >
            Clear
          </Button>
          <button type="button" onClick={onClose} aria-label="Close queue" className="p-2 text-muted hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {queue.map((track, i) => {
          const current = i === index
          return (
            <li
              key={`${track.id}-${i}`}
              className={cn('flex items-center gap-2 px-3 py-2', current && 'bg-accent/10')}
            >
              <button
                type="button"
                onClick={() => playTrackAt(i)}
                className="min-w-0 flex-1 text-left"
              >
                <p className={cn('truncate text-sm font-medium', current && 'text-accent')}>{track.title}</p>
                <p className="truncate text-xs text-muted">{track.artist}</p>
              </button>
              <button
                type="button"
                aria-label="Move up"
                disabled={i === 0}
                onClick={() => moveInQueue(i, i - 1)}
                className="text-muted disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={i === queue.length - 1}
                onClick={() => moveInQueue(i, i + 1)}
                className="text-muted disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`Remove ${track.title}`}
                onClick={() => removeFromQueue(i)}
                className="text-muted hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
