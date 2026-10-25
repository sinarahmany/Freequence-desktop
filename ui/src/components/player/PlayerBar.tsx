import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Captions,
  Heart,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatDuration } from '@/lib/utils'
import { usePlayer } from '@/store/playerStore'
import { CoverArt } from '@/components/CoverArt'
import { QueuePanel } from './QueuePanel'

/**
 * The scrubber. Rendered twice at different sizes: inline between the time
 * labels on desktop, and as a full-bleed line above the controls on a phone,
 * where there is no room for it beside anything.
 */
function Seek({ className }: { className?: string }) {
  const { currentTime, duration, queue, index, seek } = usePlayer()
  const track = queue[index]
  const total = duration || track?.duration || 0

  return (
    <input
      type="range"
      min={0}
      max={total || 1}
      step={1}
      value={Math.min(currentTime, total || 1)}
      onChange={(event) => seek(Number(event.target.value))}
      aria-label="Seek"
      disabled={!track}
      className={cn('slider', className)}
      // The filled portion is drawn with a gradient because a range input
      // gives no way to style the track before the thumb.
      style={{
        background: `linear-gradient(to right, var(--color-accent) ${
          total ? (currentTime / total) * 100 : 0
        }%, var(--color-hover) 0%)`,
      }}
    />
  )
}

/**
 * The persistent bottom player.
 *
 * It renders state only; the audio element itself lives in the player store, so
 * this component can re-render or remount without interrupting playback.
 *
 * Two layouts share this markup. Desktop is the familiar three-column bar. A
 * phone drops the volume slider (hardware buttons do that job), drops shuffle and
 * repeat, and moves the scrubber to a line across the top.
 */
export function PlayerBar() {
  const {
    queue,
    index,
    isPlaying,
    currentTime,
    duration,
    volume,
    muted,
    repeat,
    shuffle,
    toggle,
    next,
    previous,
    setVolume,
    toggleMute,
    cycleRepeat,
    toggleShuffle,
    lyricsOpen,
    toggleLyrics,
    syncStarred,
  } = usePlayer()

  const track = queue[index]
  const effectiveDuration = duration || track?.duration || 0
  const [queueOpen, setQueueOpen] = useState(false)

  async function toggleStar() {
    if (!track) return
    await api.star(track.id, 'track', !track.starred)
    syncStarred(track.id, !track.starred)
  }

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2
  const RepeatIcon = repeat === 'one' ? Repeat1 : Repeat

  return (
    <footer className="relative rounded-2xl border border-white/10 bg-surface/85 px-2 pb-[env(safe-area-inset-bottom)] shadow-2xl backdrop-blur-xl md:px-4">
      {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} />}
      <Seek className="block w-full rounded-none md:hidden" />

      <div className="flex h-16 items-center gap-2 px-3 md:grid md:h-20 md:grid-cols-[1fr_auto_1fr] md:gap-4 md:px-4">
        {/* Now playing */}
        <div className="flex min-w-0 flex-1 items-center gap-3 md:flex-none">
          {track ? (
            <>
              <CoverArt
                id={track.albumId}
                hasArt={track.hasCoverArt}
                alt={track.album}
                eager
                className="h-12 w-12 shrink-0 rounded-lg border border-white/10 md:h-12 md:w-12"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" title={track.title}>
                  {track.title}
                </p>
                <Link
                  to={`/artists/${track.artistId}`}
                  className="block truncate text-xs text-muted hover:underline"
                >
                  {track.artist}
                </Link>
              </div>
              <button
                onClick={() => setQueueOpen((open) => !open)}
                aria-label="Queue"
                aria-pressed={queueOpen}
                className={cn(
                  'ml-auto shrink-0 p-2 transition-colors md:ml-1',
                  queueOpen ? 'text-accent' : 'text-muted hover:text-fg',
                )}
              >
                <ListMusic className="h-4 w-4" />
              </button>
              <button
                onClick={toggleLyrics}
                aria-label="Lyrics"
                aria-pressed={lyricsOpen}
                className={cn(
                  'shrink-0 p-2 transition-colors',
                  lyricsOpen ? 'text-accent' : 'text-muted hover:text-fg',
                )}
              >
                <Captions className="h-4 w-4" />
              </button>
              <button
                onClick={() => void toggleStar()}
                aria-label={track.starred ? 'Remove from favourites' : 'Add to favourites'}
                className="hidden shrink-0 text-muted hover:text-fg sm:block"
              >
                <Heart
                  className={cn('h-4 w-4', track.starred && 'text-accent')}
                  fill={track.starred ? 'currentColor' : 'none'}
                />
              </button>
            </>
          ) : (
            <p className="text-sm text-muted">Nothing playing</p>
          )}
        </div>

        {/* Transport and progress */}
        <div className="flex shrink-0 items-center md:w-full md:max-w-xl md:flex-col md:gap-1">
          <div className="flex items-center gap-1 md:gap-2">
            <button
              onClick={toggleShuffle}
              aria-label="Shuffle"
              aria-pressed={shuffle}
              className={cn(
                'hidden p-2 transition-colors md:block',
                shuffle ? 'text-accent' : 'text-muted hover:text-fg',
              )}
            >
              <Shuffle className="h-4 w-4" />
            </button>
            <button
              onClick={previous}
              aria-label="Previous track"
              disabled={!track}
              className="p-2 text-muted transition-colors hover:text-fg disabled:opacity-40"
            >
              <SkipBack className="h-5 w-5" fill="currentColor" />
            </button>
            <button
              onClick={toggle}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              disabled={queue.length === 0}
              className="grid h-10 w-10 place-items-center rounded-full bg-fg text-black transition-transform hover:scale-105 disabled:opacity-40"
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" fill="currentColor" />
              ) : (
                <Play className="h-5 w-5 translate-x-px" fill="currentColor" />
              )}
            </button>
            <button
              onClick={() => next()}
              aria-label="Next track"
              disabled={!track}
              className="p-2 text-muted transition-colors hover:text-fg disabled:opacity-40"
            >
              <SkipForward className="h-5 w-5" fill="currentColor" />
            </button>
            <button
              onClick={cycleRepeat}
              aria-label={`Repeat: ${repeat}`}
              aria-pressed={repeat !== 'off'}
              className={cn(
                'hidden p-2 transition-colors md:block',
                repeat !== 'off' ? 'text-accent' : 'text-muted hover:text-fg',
              )}
            >
              <RepeatIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="hidden w-full items-center gap-2 md:flex">
            <span className="w-10 text-right text-[11px] tabular-nums text-muted">
              {formatDuration(currentTime)}
            </span>
            <Seek className="flex-1" />
            <span className="w-10 text-[11px] tabular-nums text-muted">
              {formatDuration(effectiveDuration)}
            </span>
          </div>
        </div>

        {/* Volume. Hidden on a phone, where the hardware buttons do this job. */}
        <div className="hidden items-center justify-end gap-2 md:flex">
          <button
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="text-muted transition-colors hover:text-fg"
          >
            <VolumeIcon className="h-4 w-4" />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Volume"
            className="slider w-24"
            style={{
              background: `linear-gradient(to right, var(--color-fg) ${
                (muted ? 0 : volume) * 100
              }%, var(--color-hover) 0%)`,
            }}
          />
        </div>
      </div>
    </footer>
  )
}
