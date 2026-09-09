import { DEFAULT_RELATIONS } from './camelot'
import { DEFAULT_TOLERANCE } from './suggest'
import type {
  AppState,
  PoolSource,
  Playlist,
  RelationId,
  Setlist,
  SetlistEntry,
  Track,
} from './types'

export interface LibraryRow {
  user_id: string
  tracks: Track[]
  playlists: Playlist[]
  extras: Track[]
}

export interface SetlistRow {
  id: string
  user_id: string
  name: string
  entries: SetlistEntry[]
  note: string | null
  position: number
  created_at: string | null
}

export interface SettingsRow {
  user_id: string
  tolerance: number
  relations: RelationId[]
  genres: string[]
  pool_source: PoolSource
  playlist_id: string | null
  active_setlist_id: string | null
  cursor: number
  saved_at: number
}

export interface StateRows {
  library: LibraryRow
  setlists: SetlistRow[]
  settings: SettingsRow
}

export function toRows(userId: string, state: AppState): StateRows {
  return {
    library: {
      user_id: userId,
      tracks: state.library,
      playlists: state.playlists,
      extras: state.extras,
    },
    setlists: state.setlists.map((setlist, index) => ({
      id: setlist.id,
      user_id: userId,
      name: setlist.name,
      entries: setlist.entries,
      note: setlist.note ?? null,
      position: index,
      created_at: new Date(setlist.createdAt).toISOString(),
    })),
    settings: {
      user_id: userId,
      tolerance: state.tolerance,
      relations: state.relations,
      genres: state.genres,
      pool_source: state.poolSource,
      playlist_id: state.playlistId,
      active_setlist_id: state.activeId,
      cursor: state.cursor,
      saved_at: state.savedAt,
    },
  }
}

function array<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

// Postgres numeric/bigint alanları bazı sürümlerde dize olarak dönüyor.
function number(value: unknown, fallback: number): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function createdAt(value: string | null | undefined): number {
  if (!value) return Date.now()
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Date.now()
}

export interface RowInput {
  library: Partial<LibraryRow> | null
  setlists: Partial<SetlistRow>[]
  settings: Partial<SettingsRow> | null
}

// Veritabanından gelen her şey dış veri sayılır: eksik ya da bozuk alanlar
// varsayılana düşer, hiçbir durumda çökmez.
export function fromRows(rows: RowInput): AppState {
  const setlists: Setlist[] = rows.setlists
    .filter((row): row is Partial<SetlistRow> & { id: string } => typeof row.id === 'string')
    .sort((a, b) => number(a.position, 0) - number(b.position, 0))
    .map((row) => ({
      id: row.id,
      name: text(row.name) ?? 'Adsız set',
      entries: array<SetlistEntry>(row.entries).filter(
        (entry) => entry && typeof entry.trackId === 'string',
      ),
      note: text(row.note) ?? undefined,
      createdAt: createdAt(row.created_at),
    }))

  const safeSetlists =
    setlists.length > 0
      ? setlists
      : [{ id: 'set-1', name: 'Set 1', entries: [], createdAt: Date.now() }]

  const activeId = text(rows.settings?.active_setlist_id)
  const relations = array<RelationId>(rows.settings?.relations)
  const poolSource = rows.settings?.pool_source === 'library' ? 'library' : 'catalog'

  return {
    library: array<Track>(rows.library?.tracks),
    extras: array<Track>(rows.library?.extras),
    playlists: array<Playlist>(rows.library?.playlists),
    playlistId: text(rows.settings?.playlist_id),
    setlists: safeSetlists,
    activeId: safeSetlists.some((setlist) => setlist.id === activeId) ? activeId : safeSetlists[0].id,
    cursor: Math.max(0, number(rows.settings?.cursor, 0)),
    tolerance: number(rows.settings?.tolerance, DEFAULT_TOLERANCE),
    relations: relations.length > 0 ? relations : [...DEFAULT_RELATIONS],
    genres: array<string>(rows.settings?.genres),
    poolSource: poolSource as PoolSource,
    savedAt: number(rows.settings?.saved_at, 0),
  }
}
