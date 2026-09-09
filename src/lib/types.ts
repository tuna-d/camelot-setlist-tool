export type TrackSource = 'library' | 'catalog' | 'web' | 'manual'

export interface Track {
  id: string
  title: string
  artist: string
  bpm: number | null
  key: string | null
  genre?: string
  duration?: number
  location?: string
  source: TrackSource
  ext?: string
}

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
}

export interface SetlistEntry {
  trackId: string
  note?: string
  /** Energy rated by hand, 1-5; absent when never rated. */
  energy?: number
}

export interface Setlist {
  id: string
  name: string
  entries: SetlistEntry[]
  note?: string
  createdAt: number
}

export type RelationId =
  | 'same'
  | 'up'
  | 'down'
  | 'relative'
  | 'boost'
  | 'diagonal'
  | 'semiUp'
  | 'semiDown'

export type Tone = 'neutral' | 'energy' | 'calm' | 'color' | 'jump' | 'risk'

export type PoolSource = 'catalog' | 'library'

export interface Catalog {
  updatedAt: string
  source: string
  strategy: string
  tracks: Track[]
}

export interface AppState {
  library: Track[]
  extras: Track[]
  playlists: Playlist[]
  playlistId: string | null
  setlists: Setlist[]
  activeId: string | null
  cursor: number
  tolerance: number
  relations: RelationId[]
  genres: string[]
  poolSource: PoolSource
  savedAt: number
}
