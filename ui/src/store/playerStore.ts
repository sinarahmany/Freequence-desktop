import { create } from 'zustand'
import { api, streamUrl } from '@/lib/api'
import { shuffled } from '@/lib/utils'
import type { Track } from '@/lib/types'

export type RepeatMode = 'off' | 'all' | 'one'

interface PlayerState {
  queue: Track[]
  index: number
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  repeat: RepeatMode
  shuffle: boolean
  /** True while the saved queue is being restored, so the UI can stay quiet. */
  hydrating: boolean
  lyricsOpen: boolean

  playTracks: (tracks: Track[], startIndex?: number) => void
  playTrackAt: (index: number) => void
  enqueue: (tracks: Track[]) => void
  /** Drops one row. Removing the current song starts the next one. */
  removeFromQueue: (at: number) => void
  /** Reorders the queue without restarting the song that is already playing. */
  moveInQueue: (from: number, to: number) => void
  toggle: () => void
  pause: () => void
  next: (userInitiated?: boolean) => void
  previous: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  cycleRepeat: () => void
  toggleShuffle: () => void
  toggleLyrics: () => void
  clearQueue: () => void
  restoreQueue: () => Promise<void>
  /** Applied by the store's own audio listeners; not called from components. */
  syncStarred: (trackId: string, starred: boolean) => void
}

/**
 * A single module-level Audio element backs playback.
 *
 * Keeping it outside React means navigating between pages never unmounts the
 * player and never interrupts the song, which a component-owned <audio> would.
 */
let audio: HTMLAudioElement | null = null

/** Guards against scrobbling the same play more than once. */
let scrobbled = false

function getAudio(): HTMLAudioElement {
  if (audio) return audio
  audio = new Audio()
  audio.preload = 'auto'

  audio.addEventListener('timeupdate', () => {
    const el = audio!
    usePlayer.setState({ currentTime: el.currentTime })

    // Count a play once half the track has been heard, which is roughly what
    // Last.fm and the Subsonic clients do.
    const current = currentTrack(usePlayer.getState())
    if (!scrobbled && current && el.duration > 0 && el.currentTime > el.duration / 2) {
      scrobbled = true
      void api.scrobble(current.id).catch(() => undefined)
    }
    schedulePersist()
  })

  audio.addEventListener('loadedmetadata', () => {
    usePlayer.setState({ duration: audio!.duration })
  })

  audio.addEventListener('ended', () => {
    // Not user initiated: repeat and end-of-queue rules apply.
    usePlayer.getState().next(false)
  })

  audio.addEventListener('play', () => usePlayer.setState({ isPlaying: true }))
  audio.addEventListener('pause', () => {
    usePlayer.setState({ isPlaying: false })
    persistQueue()
  })

  audio.addEventListener('error', () => {
    const current = currentTrack(usePlayer.getState())
    console.error('playback failed', current?.title)
    usePlayer.setState({ isPlaying: false })
  })

  return audio
}

function currentTrack(state: PlayerState): Track | undefined {
  return state.queue[state.index]
}

/** Loads a track into the audio element and starts playing it. */
function load(track: Track | undefined, autoplay: boolean, startAt = 0) {
  const el = getAudio()
  if (!track) {
    el.pause()
    el.removeAttribute('src')
    return
  }
  scrobbled = false
  el.src = streamUrl(track.id)
  if (startAt > 0) {
    // currentTime can only be set once the browser knows the stream is seekable.
    el.addEventListener('loadedmetadata', () => (el.currentTime = startAt), { once: true })
  }
  if (autoplay) {
    void el.play().catch(() => {
      // Autoplay is blocked until the user interacts with the page. Restoring a
      // queue on load hits this, which is expected rather than an error.
      usePlayer.setState({ isPlaying: false })
    })
  }
}

// Saving the queue on every timeupdate would mean several writes per second, so
// writes are coalesced and only the latest state is sent.
let persistTimer: number | undefined
let lastPersistedAt = 0

function schedulePersist() {
  const now = Date.now()
  if (now - lastPersistedAt < 10_000) return
  lastPersistedAt = now
  persistQueue()
}

function persistQueue() {
  if (persistTimer) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    const state = usePlayer.getState()
    if (state.hydrating || state.queue.length === 0) return
    void api
      .saveQueue(
        state.queue.map((t) => t.id),
        currentTrack(state)?.id ?? '',
        state.currentTime,
      )
      .catch(() => undefined)
  }, 800)
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: Number(localStorage.getItem('mp:volume') ?? 0.8),
  muted: false,
  repeat: (localStorage.getItem('mp:repeat') as RepeatMode) ?? 'off',
  shuffle: localStorage.getItem('mp:shuffle') === 'true',
  hydrating: false,
  lyricsOpen: false,

  playTracks: (tracks, startIndex = 0) => {
    if (tracks.length === 0) return
    const { shuffle } = get()
    // Shuffling here rather than at playback time keeps the visible queue order
    // and the playing order identical, so "what's next" is never a surprise.
    let queue = tracks
    let index = startIndex
    if (shuffle) {
      const first = tracks[startIndex]
      queue = [first, ...shuffled(tracks.filter((_, i) => i !== startIndex))]
      index = 0
    }
    set({ queue, index, currentTime: 0 })
    load(queue[index], true)
    persistQueue()
  },

  playTrackAt: (index) => {
    const { queue } = get()
    if (index < 0 || index >= queue.length) return
    set({ index, currentTime: 0 })
    load(queue[index], true)
    persistQueue()
  },

  enqueue: (tracks) => {
    const { queue, index } = get()
    const next = [...queue, ...tracks]
    set({ queue: next })
    // Nothing was loaded yet, so start playing what was just added.
    if (index < 0) get().playTrackAt(queue.length)
    else persistQueue()
  },

  removeFromQueue: (at) => {
    const { queue, index, isPlaying } = get()
    if (at < 0 || at >= queue.length) return
    const next = queue.filter((_, i) => i !== at)
    if (next.length === 0) {
      get().clearQueue()
      return
    }
    if (at === index) {
      const nextIndex = Math.min(at, next.length - 1)
      set({ queue: next, index: nextIndex, currentTime: 0 })
      load(next[nextIndex], isPlaying)
      persistQueue()
      return
    }
    set({ queue: next, index: at < index ? index - 1 : index })
    persistQueue()
  },

  moveInQueue: (from, to) => {
    const { queue, index } = get()
    if (from === to || from < 0 || to < 0 || from >= queue.length || to >= queue.length) return
    const next = [...queue]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    let nextIndex = index
    if (index === from) nextIndex = to
    else if (from < index && to >= index) nextIndex -= 1
    else if (from > index && to <= index) nextIndex += 1
    set({ queue: next, index: nextIndex })
    persistQueue()
  },

  toggle: () => {
    const el = getAudio()
    const { index, queue } = get()
    if (index < 0 && queue.length > 0) {
      get().playTrackAt(0)
      return
    }
    if (el.paused) void el.play().catch(() => undefined)
    else el.pause()
  },

  pause: () => getAudio().pause(),

  next: (userInitiated = true) => {
    const { queue, index, repeat } = get()
    if (queue.length === 0) return

    if (!userInitiated && repeat === 'one') {
      const el = getAudio()
      el.currentTime = 0
      scrobbled = false
      void el.play().catch(() => undefined)
      return
    }

    const isLast = index >= queue.length - 1
    if (isLast) {
      if (repeat === 'all') {
        get().playTrackAt(0)
        return
      }
      // End of the queue: stop rather than wrapping silently.
      if (!userInitiated) {
        getAudio().pause()
        set({ currentTime: 0 })
      }
      return
    }
    get().playTrackAt(index + 1)
  },

  previous: () => {
    const el = getAudio()
    // Restart the track first, matching how every other player behaves; only a
    // second press within the first few seconds goes back.
    if (el.currentTime > 3) {
      el.currentTime = 0
      return
    }
    const { index } = get()
    if (index > 0) get().playTrackAt(index - 1)
    else el.currentTime = 0
  },

  seek: (seconds) => {
    const el = getAudio()
    if (Number.isFinite(el.duration)) {
      el.currentTime = Math.min(Math.max(seconds, 0), el.duration)
      set({ currentTime: el.currentTime })
    }
  },

  setVolume: (volume) => {
    const clamped = Math.min(Math.max(volume, 0), 1)
    getAudio().volume = clamped
    getAudio().muted = false
    localStorage.setItem('mp:volume', String(clamped))
    set({ volume: clamped, muted: false })
  },

  toggleMute: () => {
    const el = getAudio()
    el.muted = !el.muted
    set({ muted: el.muted })
  },

  cycleRepeat: () => {
    const order: RepeatMode[] = ['off', 'all', 'one']
    const next = order[(order.indexOf(get().repeat) + 1) % order.length]
    localStorage.setItem('mp:repeat', next)
    set({ repeat: next })
  },

  toggleShuffle: () => {
    const next = !get().shuffle
    localStorage.setItem('mp:shuffle', String(next))
    set({ shuffle: next })
  },

  toggleLyrics: () => set({ lyricsOpen: !get().lyricsOpen }),

  clearQueue: () => {
    load(undefined, false)
    set({ queue: [], index: -1, currentTime: 0, duration: 0, isPlaying: false })
    void api.saveQueue([], '', 0).catch(() => undefined)
  },

  /**
   * Restores the queue saved by this or any other device. Playback is left paused:
   * browsers block autoplay before a user gesture, and resuming audio on page load
   * without being asked is hostile anyway.
   */
  restoreQueue: async () => {
    set({ hydrating: true })
    try {
      const saved = await api.getQueue()
      if (!saved.tracks?.length) return
      const index = Math.max(
        0,
        saved.tracks.findIndex((t) => t.id === saved.current),
      )
      const track = saved.tracks[index]
      // A queue saved by another client can carry a position past the end of the
      // track, for instance if the library was rescanned. Start over rather than
      // opening on a seek bar that is already at the end.
      const position =
        track.duration > 0 && saved.position >= track.duration ? 0 : saved.position
      set({ queue: saved.tracks, index, currentTime: position })
      const el = getAudio()
      el.volume = get().volume
      load(track, false, position)
    } catch {
      // No saved queue, or not signed in yet. Either way, start empty.
    } finally {
      set({ hydrating: false })
    }
  },

  syncStarred: (trackId, starred) =>
    set((state) => ({
      queue: state.queue.map((t) => (t.id === trackId ? { ...t, starred } : t)),
    })),
}))

/** The track currently loaded, if any. */
export function useCurrentTrack(): Track | undefined {
  return usePlayer((state) => state.queue[state.index])
}

// Apply the persisted volume as soon as the element exists.
getAudio().volume = usePlayer.getState().volume
