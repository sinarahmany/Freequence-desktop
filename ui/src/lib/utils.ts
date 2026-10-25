import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merges class names, letting later Tailwind utilities win over earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Formats seconds as m:ss, or h:mm:ss for anything an hour or longer. */
export function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds < 0 || !Number.isFinite(seconds)) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Formats a total playtime as a human phrase, for library summaries. */
export function formatTotalTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days} day${days === 1 ? '' : 's'}, ${hours % 24} hr`
  }
  if (hours >= 1) return `${hours} hr ${Math.floor((seconds % 3600) / 60)} min`
  const minutes = Math.floor(seconds / 60)
  // A tiny library would otherwise read "0 min", which looks like a bug.
  if (minutes < 1) return `${Math.round(seconds)} sec`
  return `${minutes} min`
}

/** Fisher-Yates shuffle, returning a new array. */
export function shuffled<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
