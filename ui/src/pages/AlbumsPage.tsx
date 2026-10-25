import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { AlbumGrid } from '@/components/AlbumCard'
import { EmptyState, LoadingState } from '@/components/ui/Spinner'
import type { AlbumSort } from '@/lib/types'

const sorts: { value: AlbumSort; label: string }[] = [
  { value: 'newest', label: 'Recently added' },
  { value: 'alphabeticalByName', label: 'A-Z' },
  { value: 'alphabeticalByArtist', label: 'By artist' },
  { value: 'frequent', label: 'Most played' },
  { value: 'recent', label: 'Recently played' },
  { value: 'starred', label: 'Favorites' },
  { value: 'random', label: 'Random' },
]

/** Each request stays under the server's page cap. Scrolling asks for the next page. */
const pageSize = 200

export function AlbumsPage() {
  const [sort, setSort] = useState<AlbumSort>('newest')
  const sentinel = useRef<HTMLDivElement>(null)

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['albums', 'page', sort],
    queryFn: ({ pageParam }) => api.albums({ sort, size: pageSize, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, offset) => {
      // A random page is a fresh shuffle, so a second page would repeat albums.
      if (sort === 'random' || lastPage.length < pageSize) return undefined
      return offset + lastPage.length
    },
  })

  const albums = data?.pages.flat() ?? []

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
  }, [hasNextPage, fetchNextPage, albums.length])

  return (
    <div>
      <h1 className="mb-4 text-3xl font-extrabold tracking-tight">Albums</h1>

      {/* Scrolls sideways rather than wrapping, so a narrow screen keeps these on
          one line instead of stacking seven rows of chips above the grid. */}
      <div className="scrollbar-none mb-6 flex gap-2 overflow-x-auto">
        {sorts.map((option) => (
          <button
            key={option.value}
            onClick={() => setSort(option.value)}
            aria-pressed={sort === option.value}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              sort === option.value
                ? 'bg-white/10 text-white'
                : 'text-zinc-400 hover:text-white',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : albums.length === 0 ? (
        <EmptyState title="No albums here" description="Try a different filter, or run a scan." />
      ) : (
        <>
          <AlbumGrid albums={albums} />
          <div ref={sentinel} className="h-px" />
          {isFetchingNextPage && (
            <p className="py-6 text-center text-sm text-muted">Loading more albums…</p>
          )}
        </>
      )}
    </div>
  )
}
