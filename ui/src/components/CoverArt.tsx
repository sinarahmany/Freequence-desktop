import { useState } from 'react'
import { Music } from 'lucide-react'
import { coverUrl } from '@/lib/api'
import { cn } from '@/lib/utils'

interface CoverArtProps {
  /** Album or track ID. */
  id?: string
  hasArt?: boolean
  /** Full cover URL from the API, used when it carries a cache-busting query. */
  src?: string
  alt: string
  className?: string
  /** Eager loading is only appropriate for art that is above the fold. */
  eager?: boolean
  /** Placeholder glyph, for artists who should get a silhouette instead of a note. */
  fallback?: React.ReactNode
}

/**
 * Album artwork with a graceful fallback. The server returns 404 when it has no
 * art cached for an album, so a broken image is a normal outcome rather than an
 * error, and is handled by swapping in a placeholder.
 */
export function CoverArt({
  id,
  hasArt,
  src: srcProp,
  alt,
  className,
  eager = false,
  fallback,
}: CoverArtProps) {
  const [failed, setFailed] = useState(false)
  const src = srcProp || coverUrl(id, hasArt ?? false)

  if (!src || failed) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-elevated text-muted',
          className,
        )}
        aria-label={alt}
        role="img"
      >
        {fallback ?? <Music className="h-1/3 w-1/3" strokeWidth={1.5} />}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('bg-elevated object-cover', className)}
    />
  )
}
