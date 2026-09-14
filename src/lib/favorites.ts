import { trackKey } from './suggest'
import type { Track, TrackSource } from './types'

/**
 * Favorites keep a copy of the whole track, not just its id. A catalog track can
 * drop out of the weekly refresh and a web result lives nowhere else, so an id
 * alone would leave the list with rows it can no longer name.
 */

const SOURCES: readonly TrackSource[] = ['library', 'catalog', 'web', 'manual']

/**
 * The same song arrives with different ids from the catalog, the library and a web
 * search. Matching on artist and title too keeps the heart filled on every copy.
 */
function matches(track: Track): (favorite: Track) => boolean {
  const signature = trackKey(track)
  return (favorite) => favorite.id === track.id || trackKey(favorite) === signature
}

export function isFavorite(favorites: Track[], track: Track): boolean {
  return favorites.some(matches(track))
}

/** Newest first. Removing drops every copy that names the same song. */
export function toggleFavorite(favorites: Track[], track: Track): Track[] {
  const same = matches(track)
  if (favorites.some(same)) return favorites.filter((favorite) => !same(favorite))
  return [{ ...track }, ...favorites]
}

/** Keeps `mine` in order and appends the songs only `theirs` has. */
export function mergeFavorites(mine: Track[], theirs: Track[]): Track[] {
  const out = [...mine]
  for (const track of theirs) {
    if (!isFavorite(out, track)) out.push(track)
  }
  return out
}

function readTrack(value: unknown): Track | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || !record.id) return null
  if (typeof record.title !== 'string' || !record.title.trim()) return null

  const bpm = typeof record.bpm === 'number' && Number.isFinite(record.bpm) && record.bpm > 0 ? record.bpm : null
  const source = SOURCES.includes(record.source as TrackSource) ? (record.source as TrackSource) : 'manual'
  const track: Track = {
    id: record.id,
    title: record.title,
    artist: typeof record.artist === 'string' ? record.artist : '',
    bpm,
    key: typeof record.key === 'string' && record.key ? record.key : null,
    source,
  }

  if (typeof record.genre === 'string' && record.genre) track.genre = record.genre
  if (typeof record.duration === 'number' && Number.isFinite(record.duration) && record.duration > 0) {
    track.duration = record.duration
  }
  if (typeof record.location === 'string' && record.location) track.location = record.location
  if (typeof record.ext === 'string' && record.ext) track.ext = record.ext
  return track
}

/**
 * Favorites come back from localStorage and the database: unreadable rows are
 * dropped, repeats are folded, and a value that is not a list reads as empty.
 */
export function readFavorites(value: unknown): Track[] {
  if (!Array.isArray(value)) return []
  const out: Track[] = []
  for (const item of value) {
    const track = readTrack(item)
    if (track && !isFavorite(out, track)) out.push(track)
  }
  return out
}
