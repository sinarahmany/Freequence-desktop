// Mirrors the JSON emitted by internal/api/dto.go.

export interface LyricLine {
  /** Seconds from the start. Absent for unsynced lyrics. */
  at?: number
  text: string
}

export interface Lyrics {
  synced: boolean
  instrumental: boolean
  source?: string
  lines: LyricLine[]
}

export interface Track {
  id: string
  title: string
  albumId: string
  album: string
  artistId: string
  artist: string
  albumArtist?: string
  trackNumber?: number
  discNumber?: number
  year?: number
  genre?: string
  duration: number
  bitRate: number
  sampleRate?: number
  channels?: number
  suffix: string
  contentType: string
  size: number
  hasCoverArt: boolean
  createdAt: string
  starred: boolean
  rating: number
  playCount: number
  coverArt?: string
  streamUrl: string
}

export interface AlbumSuggestion {
  name: string
  artist: string
  year?: number
  genre?: string
  coverUrl?: string
}

export interface CoverSuggestion {
  imageUrl: string
  name: string
  artist: string
}

export interface Album {
  id: string
  name: string
  artistId: string
  artist: string
  year?: number
  genre?: string
  songCount: number
  discCount: number
  duration: number
  hasCoverArt: boolean
  createdAt: string
  starred: boolean
  rating: number
  playCount: number
  coverArt?: string
}

export interface Artist {
  id: string
  name: string
  sortName?: string
  albumCount: number
  songCount: number
  duration: number
  createdAt: string
  starred: boolean
  rating: number
  playCount: number
  /** Present when the server has an image for this artist, dedicated or borrowed. */
  coverArt?: string
}

export interface Playlist {
  id: string
  name: string
  comment?: string
  ownerId: string
  owner: string
  public: boolean
  songCount: number
  duration: number
  hasCover?: boolean
  /** Present when the playlist has its own picture. */
  coverArt?: string
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  username: string
  email?: string
  isAdmin: boolean
  mustChangePassword: boolean
  lastLoginAt?: string
  createdAt: string
}

export interface Stats {
  artists: number
  albums: number
  tracks: number
  duration: number
}

export interface Genre {
  name: string
  songCount: number
  albumCount: number
}

export interface LibraryFolder {
  id?: string
  name: string
  label: string
  builtin: boolean
}

export interface BrowseEntry {
  name: string
  path: string
  label: string
}

export interface BrowseResult {
  path: string
  label: string
  parent?: string
  canAdd: boolean
  entries: BrowseEntry[]
}

export interface ScanStatus {
  scanning: boolean
  startedAt?: string
  finishedAt?: string
  scanned: number
  added: number
  updated: number
  removed: number
  error?: string
}

export interface SearchResults {
  artists: Artist[]
  albums: Album[]
  tracks: Track[]
}

export interface SavedQueue {
  trackIds: string[]
  current: string
  position: number
  tracks: Track[]
}

export type ItemType = 'track' | 'album' | 'artist'

/** Album orderings the backend understands, matching the Subsonic list types. */
export type AlbumSort =
  | 'newest'
  | 'recent'
  | 'frequent'
  | 'random'
  | 'alphabeticalByName'
  | 'alphabeticalByArtist'
  | 'starred'
  | 'highest'
