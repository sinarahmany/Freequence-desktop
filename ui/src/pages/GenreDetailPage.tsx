import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { AlbumGrid } from '@/components/AlbumCard'
import { EmptyState, LoadingState } from '@/components/ui/Spinner'

const pageSize = 200

export function GenreDetailPage() {
  const { name = '' } = useParams()
  const genre = decodeURIComponent(name)
  const sentinel = useRef<HTMLDivElement>(null)

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['albums', 'genre', genre],
    queryFn: ({ pageParam }) =>
      api.albums({ genre, sort: 'alphabeticalByName', size: pageSize, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, offset) => {
      if (lastPage.length < pageSize) return undefined
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
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">
        <Link to="/genres" className="hover:text-fg hover:underline">
          Genres
        </Link>
      </p>
      <h1 className="mt-1 mb-6 text-3xl font-extrabold tracking-tight break-words">{genre}</h1>
      {isLoading ? (
        <LoadingState />
      ) : albums.length === 0 ? (
        <EmptyState title="No albums in this genre" />
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
