import { Link, useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { api } from '@/lib/api'
import { usePlayer } from '@/store/playerStore'
import { useContextMenu } from './ui/ContextMenu'
import { CoverArt } from './CoverArt'
import type { Album } from '@/lib/types'

/**
 * One album in a grid. The play button loads the album's tracks on demand, so a
 * grid of a hundred albums does not fetch a hundred track lists up front.
 */
export function AlbumCard({ album, eager = false }: { album: Album; eager?: boolean }) {
  const playTracks = usePlayer((s) => s.playTracks)
  const navigate = useNavigate()
  const { open } = useContextMenu()

  async function playAlbum(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    const { tracks } = await api.album(album.id)
    playTracks(tracks)
  }

  return (
    <Link
      to={`/albums/${album.id}`}
      onContextMenu={(event) =>
        open(event, [
          { label: 'Play', onClick: () => void playAlbum(event) },
          { label: 'Go to artist', onClick: () => navigate(`/artists/${album.artistId}`) },
        ])
      }
      className="group flex flex-col rounded-2xl border border-white/5 bg-white/[0.03] p-3.5 transition-all duration-300 hover:border-white/10 hover:bg-white/[0.07]"
    >
      <div className="relative mb-3 aspect-square w-full overflow-hidden rounded-xl shadow-lg">
        <CoverArt
          id={album.id}
          src={album.coverArt}
          hasArt={album.hasCoverArt}
          alt={album.name}
          eager={eager}
          className="h-full w-full transition-transform duration-500 group-hover:scale-105"
        />
        <button
          onClick={playAlbum}
          aria-label={`Play ${album.name}`}
          // Touch devices have no hover to reveal this, so below md it is always
          // visible rather than unreachable.
          className="absolute right-2.5 bottom-2.5 grid h-11 w-11 place-items-center rounded-full bg-accent text-[#08080a] shadow-xl transition-all hover:scale-110 hover:bg-accent-hover md:translate-y-3 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:focus-visible:translate-y-0 md:focus-visible:opacity-100"
        >
          <Play className="h-5 w-5 translate-x-px" fill="currentColor" />
        </button>
      </div>

      <p className="truncate text-sm font-bold transition-colors group-hover:text-accent" title={album.name}>
        {album.name}
      </p>
      <p className="mt-1 truncate text-xs text-zinc-400" title={album.artist}>
        {album.year ? `${album.year} • ` : ''}
        {album.artist}
      </p>
    </Link>
  )
}

/** Responsive album grid, used by every page that lists albums. */
export function AlbumGrid({ albums }: { albums: Album[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {albums.map((album, i) => (
        // The first row is above the fold on every viewport, so load it eagerly.
        <AlbumCard key={album.id} album={album} eager={i < 7} />
      ))}
    </div>
  )
}
