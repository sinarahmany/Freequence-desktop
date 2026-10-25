import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Play, Shuffle } from 'lucide-react'
import { api } from '@/lib/api'
import { shuffled } from '@/lib/utils'
import { usePlayer } from '@/store/playerStore'
import { TrackList } from '@/components/TrackList'
import { Button } from '@/components/ui/Button'
import { EmptyState, LoadingState } from '@/components/ui/Spinner'
import type { Track } from '@/lib/types'

/** Each request stays under the server's page cap. Scrolling asks for the next page. */
const pageSize = 200

async function everySong(): Promise<Track[]> {
  const all: Track[] = []
  let offset = 0
  for (;;) {
    const page = await api.tracks({ size: pageSize, offset })
    all.push(...page)
    if (page.length < pageSize) return all
    offset += page.length
  }
}

export function SongsPage() {
  const playTracks = usePlayer((s) => s.playTracks)
  const sentinel = useRef<HTMLDivElement>(null)
  const [starting, setStarting] = useState(false)

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useInfiniteQuery({
    queryKey: ['tracks', 'page'],
    queryFn: ({ pageParam }) => api.tracks({ size: pageSize, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, offset) => {
      if (lastPage.length < pageSize) return undefined
      return offset + lastPage.length
    },
  })

  const tracks = data?.pages.flat() ?? []

  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage()
      },
      { rootMargin: '600px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasNextPage, fetchNextPage, tracks.length])

  async function playAll(order: 'list' | 'shuffle') {
    setStarting(true)
    try {
      const all = await everySong()
      playTracks(order === 'shuffle' ? shuffled(all) : all)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-3xl font-extrabold tracking-tight">Songs</h1>
      <div className="mb-6 flex gap-3">
        <Button variant="primary" onClick={() => void playAll('list')} disabled={starting || tracks.length === 0}>
          <Play className="h-4 w-4" fill="currentColor" />
          Play all
        </Button>
        <Button onClick={() => void playAll('shuffle')} disabled={starting || tracks.length === 0}>
          <Shuffle className="h-4 w-4" />
          Shuffle
        </Button>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : tracks.length === 0 ? (
        <EmptyState title="No songs yet" />
      ) : (
        <>
          <TrackList tracks={tracks} onStarChanged={() => void refetch()} />
          <div ref={sentinel} className="h-px" />
          {isFetchingNextPage && <p className="py-6 text-center text-sm text-muted">Loading more songs…</p>}
        </>
      )}
    </div>
  )
}
