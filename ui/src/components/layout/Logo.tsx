import { cn } from '@/lib/utils'

/** The mark from the app frame: a small wave inside a green-to-cyan tile. */
export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-cyan-400 p-[1.5px] shadow-lg shadow-emerald-500/20',
        className,
      )}
    >
      <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-surface">
        <svg
          className="h-5 w-5 text-emerald-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M2 12a10 10 0 0 1 10-10" />
          <path d="M6 12a6 6 0 0 1 6-6" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
          <path d="M12 14v8" />
          <path d="M12 18h4" />
          <path d="M12 14h6" />
        </svg>
      </div>
    </div>
  )
}
