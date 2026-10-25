import type {
  Album,
  AlbumSort,
  AlbumSuggestion,
  CoverSuggestion,
  Artist,
  Genre,
  ItemType,
  Playlist,
  SavedQueue,
  BrowseResult,
  LibraryFolder,
  ScanStatus,
  SearchResults,
  Stats,
  Lyrics,
  Track,
  User,
} from './types'

const BASE = '/api/v1'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Requests carry the session cookie the login endpoint sets. There is no token in
 * localStorage on purpose: the same cookie is what lets the <audio> element
 * authenticate its stream request, which cannot send an Authorization header.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(BASE + path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    let message = response.statusText
    try {
      const body = await response.json()
      if (body?.error) message = body.error
    } catch {
      // Not a JSON error body; the status text will do.
    }
    throw new ApiError(response.status, message)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export interface Session {
  user: User
  subsonicApiKey: string
}

export const api = {
  setupStatus: () => request<{ needsSetup: boolean }>('/setup'),

  setup: (username: string, password: string) =>
    request<Session>('/setup', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<Session>('/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  logout: () => request<void>('/logout', { method: 'POST' }),

  me: () => request<Session>('/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('/me/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  users: () => request<{ users: User[] }>('/users').then((r) => r.users ?? []),

  createUser: (username: string, password: string, isAdmin: boolean) =>
    request<User>('/users', {
      method: 'POST',
      body: JSON.stringify({ username, password, isAdmin }),
    }),

  deleteUser: (id: string) => request<void>(`/users/${id}`, { method: 'DELETE' }),

  resetPassword: (id: string, password: string) =>
    request<void>(`/users/${id}/password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  stats: () => request<Stats>('/stats'),

  albums: (params: { sort?: AlbumSort; size?: number; offset?: number; genre?: string } = {}) =>
    request<{ albums: Album[] }>('/albums' + query(params)).then((r) => r.albums ?? []),

  album: (id: string) => request<{ album: Album; tracks: Track[] }>(`/albums/${id}`),

  artists: () => request<{ artists: Artist[] }>('/artists').then((r) => r.artists ?? []),

  artist: (id: string) => request<{ artist: Artist; albums: Album[] }>(`/artists/${id}`),

  tracks: (params: { size?: number; offset?: number; genre?: string; random?: boolean } = {}) =>
    request<{ tracks: Track[] }>('/tracks' + query(params)).then((r) => r.tracks ?? []),

  lyrics: (id: string) => request<Lyrics>(`/tracks/${id}/lyrics`),

  genres: () => request<{ genres: Genre[] }>('/genres').then((r) => r.genres ?? []),

  search: (q: string) => request<SearchResults>('/search' + query({ q })),

  starred: () => request<SearchResults>('/starred'),

  recentlyPlayed: (size = 24) =>
    request<{ tracks: Track[] }>('/recent' + query({ size })).then((r) => r.tracks ?? []),

  star: (id: string, type: ItemType, starred: boolean) =>
    request<void>('/star', { method: 'POST', body: JSON.stringify({ id, type, starred }) }),

  rate: (id: string, type: ItemType, rating: number) =>
    request<void>('/rating', { method: 'POST', body: JSON.stringify({ id, type, rating }) }),

  scrobble: (id: string) =>
    request<void>('/scrobble', { method: 'POST', body: JSON.stringify({ id }) }),

  getQueue: () => request<SavedQueue>('/queue'),

  saveQueue: (trackIds: string[], current: string, position: number) =>
    request<void>('/queue', {
      method: 'PUT',
      body: JSON.stringify({ trackIds, current, position }),
    }),

  playlists: () => request<{ playlists: Playlist[] }>('/playlists').then((r) => r.playlists ?? []),

  playlist: (id: string) =>
    request<{ playlist: Playlist; tracks: Track[] }>(`/playlists/${id}`),

  createPlaylist: (name: string, trackIds: string[] = []) =>
    request<{ playlist: Playlist }>('/playlists', {
      method: 'POST',
      body: JSON.stringify({ name, trackIds, public: false, comment: '' }),
    }),

  addToPlaylist: (id: string, trackIds: string[]) =>
    request<void>(`/playlists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ addTrackIds: trackIds }),
    }),

  removeFromPlaylist: (id: string, indexes: number[]) =>
    request<void>(`/playlists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ removeIndexes: indexes }),
    }),

  reorderPlaylist: (id: string, trackIds: string[]) =>
    request<void>(`/playlists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ trackIds }),
    }),

  renamePlaylist: (id: string, name: string) =>
    request<void>(`/playlists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  uploadPlaylistCover: (id: string, file: File) => {
    const body = new FormData()
    body.append('file', file)
    return request<{ playlist: Playlist }>(`/playlists/${id}/cover`, { method: 'POST', body })
  },

  clearPlaylistCover: (id: string) => request<void>(`/playlists/${id}/cover`, { method: 'DELETE' }),

  deletePlaylist: (id: string) => request<void>(`/playlists/${id}`, { method: 'DELETE' }),

  scanStatus: () => request<ScanStatus>('/scan/status'),

  startScan: () => request<ScanStatus>('/scan', { method: 'POST' }),

  folders: () =>
    request<{ folders: LibraryFolder[]; canBrowse: boolean }>('/folders'),

  browse: (path = '') => request<BrowseResult>('/browse' + query({ path })),

  addFolder: (path: string) =>
    request<LibraryFolder>('/folders', { method: 'POST', body: JSON.stringify({ path }) }),

  removeFolder: (id: string) => request<void>(`/folders/${id}`, { method: 'DELETE' }),

  albumMetadata: (id: string) =>
    request<{ suggestions: AlbumSuggestion[] }>(`/albums/${id}/metadata`),

  applyAlbumMetadata: (id: string, suggestion: AlbumSuggestion) =>
    request<Album>(`/albums/${id}/metadata`, {
      method: 'POST',
      body: JSON.stringify({
        name: suggestion.name,
        artist: suggestion.artist,
        year: suggestion.year ?? 0,
        genre: suggestion.genre ?? '',
      }),
    }),

  albumCovers: (id: string) =>
    request<{ suggestions: CoverSuggestion[] }>(`/albums/${id}/covers`),

  applyAlbumCover: (id: string, imageUrl: string) =>
    request<Album>(`/albums/${id}/cover`, {
      method: 'POST',
      body: JSON.stringify({ imageUrl }),
    }),
}

/** Cover art URL for an album or track ID, or undefined when there is no art. */
export function coverUrl(id: string | undefined, hasArt: boolean): string | undefined {
  return id && hasArt ? `${BASE}/cover/${id}` : undefined
}

/** Stream URL for a track. */
export function streamUrl(trackId: string): string {
  return `${BASE}/stream/${trackId}`
}

/** Original-file download. The session cookie goes with the request. */
export function downloadUrl(trackId: string): string {
  return `${BASE}/download/${trackId}`
}
