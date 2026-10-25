import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Mic, X } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { usePlayer } from '@/store/playerStore'
import { CoverArt } from '@/components/CoverArt'

/**
 * The lyric sheet as a column beside the page.
 *
 * Synced lines follow playback: the row whose timestamp has just passed is the
 * current one, and clicking any timed row seeks there. Plain lyrics are a
 * scrollable block with nothing highlighted.
 *
 * On a phone the column overlays the page, because a permanent side panel would
 * leave no room for the library.
 */
export function LyricsPanel() {
  const { lyricsOpen, queue, index, currentTime, seek, toggleLyrics } = usePlayer()
  const track = queue[index]
  const scroller = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['lyrics', track?.id],
    queryFn: () => api.lyrics(track!.id),
    enabled: lyricsOpen && !!track,
    staleTime: 60 * 60 * 1000,
  })

  const active = activeLine(data?.lines ?? [], data?.synced ?? false, currentTime)

  useEffect(() => {
    const box = scroller.current
    const line = activeRef.current
    if (!box || !line) return
    // Center inside this panel only. scrollIntoView also moves the page, which
    // pulls the current line up under the top bar and out of the sheet.
    const lineTop = line.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    const target = lineTop - box.clientHeight / 2 + line.clientHeight / 2
    box.scrollTo({ top: target, behavior: 'smooth' })
  }, [active, track?.id])

  if (!lyricsOpen) return null

  return (
    <>
      <div
        onClick={toggleLyrics}
        aria-hidden
        className="fixed inset-0 z-30 bg-black/60 md:hidden"
      />
      <aside className="flex min-h-0 w-[min(22rem,calc(100vw-1rem))] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface/95 shadow-2xl max-md:fixed max-md:inset-y-2 max-md:right-2 max-md:z-40 md:w-80">
        <header className="flex shrink-0 items-start gap-3 px-4 pt-4">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
            <Mic className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Live Lyrics</p>
            {data?.synced && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-accent uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Time synced
              </p>
            )}
          </div>
          <button
            onClick={toggleLyrics}
            aria-label="Close lyrics"
            className="p-1 text-muted transition-colors hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {track && (
          <div className="mx-4 mt-4 flex shrink-0 items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
            <CoverArt
              id={track.albumId}
              hasArt={track.hasCoverArt}
              alt={track.album}
              eager
              className="h-10 w-10 shrink-0 rounded-lg"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{track.title}</p>
              <p className="truncate text-xs text-muted">{track.artist}</p>
            </div>
          </div>
        )}

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {!track && <p className="py-8 text-center text-sm text-muted">Nothing playing</p>}
          {track && isLoading && <p className="py-8 text-center text-sm text-muted">Looking up lyrics…</p>}
          {track && isError && (
            <p className="py-8 text-center text-sm text-muted">Lyrics could not be loaded</p>
          )}
          {track && data?.instrumental && data.lines.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">This track is instrumental</p>
          )}
          {track && data && !data.instrumental && data.lines.length === 0 && !isLoading && (
            <p className="py-8 text-center text-sm text-muted">No lyrics found for this song</p>
          )}
          {track && data && data.lines.length > 0 && (
            <div dir="auto" className="flex flex-col gap-1">
              {data.lines.map((line, i) => {
                const current = i === active
                const text = line.text || ' '
                if (line.at == null) {
                  return (
                    <p key={i} className="px-3 py-2 text-sm leading-relaxed text-muted">
                      {text}
                    </p>
                  )
                }
                return (
                  <button
                    key={i}
                    ref={current ? activeRef : undefined}
                    onClick={() => seek(line.at!)}
                    className={cn(
                      'rounded-lg px-3 py-2 text-left text-sm leading-snug transition-colors',
                      current
                        ? 'bg-accent/20 font-semibold text-accent'
                        : 'text-muted hover:bg-white/[0.04] hover:text-fg',
                    )}
                  >
                    {text}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {data?.synced && data.lines.length > 0 && (
          <p className="shrink-0 border-t border-white/5 px-4 py-3 text-center text-xs text-muted">
            Click any line to jump playback
          </p>
        )}
      </aside>
    </>
  )
}

function activeLine(
  lines: { at?: number }[],
  synced: boolean,
  currentTime: number,
): number {
  if (!synced) return -1
  let active = -1
  for (let i = 0; i < lines.length; i++) {
    const at = lines[i].at
    if (at != null && at <= currentTime + 0.2) active = i
  }
  return active
}
