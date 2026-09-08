import { create } from 'zustand'
import { DEFAULT_RELATIONS } from '../lib/camelot'
import { DEFAULT_TOLERANCE } from '../lib/suggest'
import { trackKey } from '../lib/suggest'
import type { RekordboxLibrary } from '../lib/rekordbox'
import type {
  AppState,
  Catalog,
  PoolSource,
  RelationId,
  Setlist,
  Track,
} from '../lib/types'

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'conflict' | 'error'

export interface SyncState {
  status: SyncStatus
  message: string | null
  savedAt: number | null
}

export interface StoreState extends AppState {
  catalog: Catalog | null
  sync: SyncState

  importLibrary: (result: RekordboxLibrary) => void
  selectPlaylist: (playlistId: string | null) => void
  setCatalog: (catalog: Catalog | null) => void

  setTolerance: (tolerance: number) => void
  toggleRelation: (relation: RelationId) => void
  toggleGenre: (genre: string) => void
  setGenres: (genres: string[]) => void
  setPoolSource: (poolSource: PoolSource) => void

  newSetlist: (name?: string) => string
  selectSetlist: (id: string) => void
  renameSetlist: (id: string, name: string) => void
  removeSetlist: (id: string) => void
  setSetlistNote: (note: string) => void

  addTrack: (track: Track) => void
  removeEntry: (index: number) => void
  moveEntry: (from: number, to: number) => void
  setEntryNote: (index: number, note: string) => void
  replaceEntries: (tracks: Track[]) => void
  clearSetlist: () => void
  setCursor: (index: number) => void

  exportState: () => AppState
  hydrate: (state: Partial<AppState>) => void
  setSync: (sync: Partial<SyncState>) => void
}

function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${random}`
}

export function emptySetlist(name: string): Setlist {
  return { id: newId('set'), name, entries: [], createdAt: Date.now() }
}

export function initialAppState(): AppState {
  const set = emptySetlist('Set 1')
  return {
    library: [],
    extras: [],
    playlists: [],
    playlistId: null,
    setlists: [set],
    activeId: set.id,
    cursor: 0,
    tolerance: DEFAULT_TOLERANCE,
    relations: [...DEFAULT_RELATIONS],
    genres: [],
    poolSource: 'catalog',
    savedAt: 0,
  }
}

function updateActive(state: StoreState, change: (setlist: Setlist) => Setlist): Partial<StoreState> {
  const setlists = state.setlists.map((setlist) =>
    setlist.id === state.activeId ? change(setlist) : setlist,
  )
  return { setlists }
}

export const useStore = create<StoreState>((set, get) => ({
  ...initialAppState(),
  catalog: null,
  sync: { status: 'idle', message: null, savedAt: null },

  importLibrary: (result) =>
    set({ library: result.tracks, playlists: result.playlists, playlistId: null }),

  selectPlaylist: (playlistId) => set({ playlistId }),
  setCatalog: (catalog) => set({ catalog }),

  setTolerance: (tolerance) => set({ tolerance }),

  toggleRelation: (relation) =>
    set((state) => ({
      relations: state.relations.includes(relation)
        ? state.relations.filter((item) => item !== relation)
        : [...state.relations, relation],
    })),

  toggleGenre: (genre) =>
    set((state) => ({
      genres: state.genres.includes(genre)
        ? state.genres.filter((item) => item !== genre)
        : [...state.genres, genre],
    })),

  setGenres: (genres) => set({ genres }),
  setPoolSource: (poolSource) => set({ poolSource }),

  newSetlist: (name) => {
    const setlist = emptySetlist(name ?? `Set ${get().setlists.length + 1}`)
    set((state) => ({ setlists: [...state.setlists, setlist], activeId: setlist.id, cursor: 0 }))
    return setlist.id
  },

  selectSetlist: (id) => set({ activeId: id, cursor: 0 }),

  renameSetlist: (id, name) =>
    set((state) => ({
      setlists: state.setlists.map((setlist) =>
        setlist.id === id ? { ...setlist, name: name.trim() || setlist.name } : setlist,
      ),
    })),

  removeSetlist: (id) =>
    set((state) => {
      const rest = state.setlists.filter((setlist) => setlist.id !== id)
      const setlists = rest.length > 0 ? rest : [emptySetlist('Set 1')]
      const activeId = setlists.some((setlist) => setlist.id === state.activeId)
        ? state.activeId
        : setlists[0].id
      return { setlists, activeId, cursor: 0 }
    }),

  setSetlistNote: (note) => set((state) => updateActive(state, (setlist) => ({ ...setlist, note }))),

  addTrack: (track) =>
    set((state) => {
      const known =
        state.library.some((item) => item.id === track.id) ||
        (state.catalog?.tracks.some((item) => item.id === track.id) ?? false) ||
        state.extras.some((item) => item.id === track.id)
      return {
        // Tracks outside library and catalog must live here or the entry
        // cannot be resolved after a reload.
        extras: known ? state.extras : [...state.extras, track],
        ...updateActive(state, (setlist) => ({
          ...setlist,
          entries: [...setlist.entries, { trackId: track.id }],
        })),
      }
    }),

  removeEntry: (index) =>
    set((state) => ({
      ...updateActive(state, (setlist) => ({
        ...setlist,
        entries: setlist.entries.filter((_, i) => i !== index),
      })),
      cursor: Math.max(0, state.cursor > index ? state.cursor - 1 : state.cursor),
    })),

  moveEntry: (from, to) =>
    set((state) =>
      updateActive(state, (setlist) => {
        if (from < 0 || from >= setlist.entries.length) return setlist
        const entries = [...setlist.entries]
        const [moved] = entries.splice(from, 1)
        entries.splice(Math.max(0, Math.min(to, entries.length)), 0, moved)
        return { ...setlist, entries }
      }),
    ),

  setEntryNote: (index, note) =>
    set((state) =>
      updateActive(state, (setlist) => ({
        ...setlist,
        entries: setlist.entries.map((entry, i) => (i === index ? { ...entry, note } : entry)),
      })),
    ),

  replaceEntries: (tracks) =>
    set((state) => {
      const knownIds = new Set([
        ...state.library.map((item) => item.id),
        ...(state.catalog?.tracks.map((item) => item.id) ?? []),
        ...state.extras.map((item) => item.id),
      ])
      const extras = [...state.extras, ...tracks.filter((track) => !knownIds.has(track.id))]
      return {
        extras,
        ...updateActive(state, (setlist) => ({
          ...setlist,
          entries: tracks.map((track) => ({ trackId: track.id })),
        })),
        cursor: Math.max(0, tracks.length - 1),
      }
    }),

  clearSetlist: () =>
    set((state) => ({ ...updateActive(state, (setlist) => ({ ...setlist, entries: [] })), cursor: 0 })),

  setCursor: (index) => set({ cursor: Math.max(0, index) }),

  exportState: () => {
    const state = get()
    // Always persist the full collection, never the playlist-filtered view.
    return {
      library: state.library,
      extras: state.extras,
      playlists: state.playlists,
      playlistId: state.playlistId,
      setlists: state.setlists,
      activeId: state.activeId,
      cursor: state.cursor,
      tolerance: state.tolerance,
      relations: state.relations,
      genres: state.genres,
      poolSource: state.poolSource,
      savedAt: Date.now(),
    }
  },

  hydrate: (incoming) =>
    set((state) => {
      const setlists =
        incoming.setlists && incoming.setlists.length > 0 ? incoming.setlists : state.setlists
      const activeId = setlists.some((setlist) => setlist.id === incoming.activeId)
        ? incoming.activeId!
        : setlists[0].id
      return {
        library: incoming.library ?? state.library,
        extras: incoming.extras ?? state.extras,
        playlists: incoming.playlists ?? state.playlists,
        playlistId: incoming.playlistId ?? null,
        setlists,
        activeId,
        cursor: incoming.cursor ?? 0,
        tolerance: incoming.tolerance ?? state.tolerance,
        relations: incoming.relations ?? state.relations,
        genres: incoming.genres ?? state.genres,
        poolSource: incoming.poolSource ?? state.poolSource,
        savedAt: incoming.savedAt ?? 0,
      }
    }),

  setSync: (sync) => set((state) => ({ sync: { ...state.sync, ...sync } })),
}))

export function selectActive(state: StoreState): Setlist {
  return state.setlists.find((setlist) => setlist.id === state.activeId) ?? state.setlists[0]
}

export function selectTrack(state: StoreState, id: string): Track | null {
  return (
    state.library.find((track) => track.id === id) ??
    state.catalog?.tracks.find((track) => track.id === id) ??
    state.extras.find((track) => track.id === id) ??
    null
  )
}

export function selectEntries(state: StoreState): Track[] {
  const active = selectActive(state)
  const out: Track[] = []
  for (const entry of active.entries) {
    const track = selectTrack(state, entry.trackId)
    if (track) out.push(track)
  }
  return out
}

export function selectReference(state: StoreState): Track | null {
  const entries = selectEntries(state)
  if (entries.length === 0) return null
  const index = Math.min(state.cursor, entries.length - 1)
  return entries[index]
}

export function selectLibrary(state: StoreState): Track[] {
  if (!state.playlistId) return state.library
  const playlist = state.playlists.find((item) => item.id === state.playlistId)
  if (!playlist) return state.library
  const wanted = new Set(playlist.trackIds)
  return state.library.filter((track) => wanted.has(track.id))
}

export function selectPool(state: StoreState): Track[] {
  return state.poolSource === 'library' ? selectLibrary(state) : (state.catalog?.tracks ?? [])
}

export function selectExclude(state: StoreState): Set<string> {
  const out = new Set<string>()
  for (const track of selectEntries(state)) {
    out.add(track.id)
    out.add(trackKey(track))
  }
  return out
}

export function selectGenres(state: StoreState): string[] {
  const found = new Set<string>()
  for (const track of selectPool(state)) {
    if (track.genre) found.add(track.genre)
  }
  return [...found].sort((a, b) => a.localeCompare(b, 'tr'))
}
