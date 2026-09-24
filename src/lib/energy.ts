import { keyLetter } from './camelot'
import { trackKey } from './suggest'
import type { Setlist, SetlistEntry, Track } from './types'

/**
 * Energy on a 1-5 scale. A rating the DJ gave is the truth; until then an estimate
 * is derived from where the track's tempo sits within its own genre. The estimate
 * is recomputed on every render and never stored, see docs/adr/0001.
 */

/**
 * Below this many tracks a genre's spread is noise, so the whole pool is used.
 * Only tracks with a tempo count: the rest say nothing about the distribution.
 */
export const MIN_GENRE_TRACKS = 20

export const ENERGY_LEVELS = 5
/** Major keys read brighter than minor at the same tempo: half a band. */
const MAJOR_NUDGE = 0.5

export interface EnergyScale {
  /** Every usable tempo in the pool, ascending. */
  all: readonly number[]
  /** Normalised genre → its tempos ascending; only genres with enough tracks. */
  byGenre: ReadonlyMap<string, readonly number[]>
}

export interface EntryEnergy {
  level: number
  /** True when the DJ gave it; false when it is the estimate. */
  rated: boolean
}

function usableBpm(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function genreKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const key = value.trim().toLowerCase()
  return key || null
}

export function buildEnergyScale(pool: readonly Track[]): EnergyScale {
  const all: number[] = []
  const grouped = new Map<string, number[]>()
  // The pool is the discovery catalog or the library import, so each field is checked.
  for (const item of Array.isArray(pool) ? (pool as unknown[]) : []) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const bpm = usableBpm(record.bpm)
    if (bpm === null) continue
    all.push(bpm)
    const key = genreKey(record.genre)
    if (key === null) continue
    const found = grouped.get(key)
    if (found) found.push(bpm)
    else grouped.set(key, [bpm])
  }

  const ascending = (a: number, b: number) => a - b
  all.sort(ascending)
  const byGenre = new Map<string, number[]>()
  for (const [key, tempos] of grouped) {
    if (tempos.length >= MIN_GENRE_TRACKS) byGenre.set(key, tempos.sort(ascending))
  }
  return { all, byGenre }
}

/** First index whose value is not below `value` (or above it, with `after`). */
function bound(sorted: readonly number[], value: number, after: boolean): number {
  let low = 0
  let high = sorted.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (sorted[mid] < value || (after && sorted[mid] === value)) low = mid + 1
    else high = mid
  }
  return low
}

// Mid-rank, so a tempo shared by many tracks lands in the middle of its run rather
// than at the bottom, and the same input always gives the same share.
function percentile(sorted: readonly number[], value: number): number {
  const below = bound(sorted, value, false)
  const through = bound(sorted, value, true)
  return (below + (through - below) / 2) / sorted.length
}

export function estimateEnergy(scale: EnergyScale, track: Track): number | null {
  const bpm = usableBpm(track.bpm)
  if (bpm === null) return null
  const key = genreKey(track.genre)
  const tempos = (key !== null ? scale.byGenre.get(key) : undefined) ?? scale.all
  if (tempos.length === 0) return null

  const nudge = keyLetter(track.key) === 'B' ? MAJOR_NUDGE : 0
  const band = Math.floor(percentile(tempos, bpm) * ENERGY_LEVELS + nudge) + 1
  return Math.min(ENERGY_LEVELS, Math.max(1, band))
}

/** A whole level on the 1-5 scale, or null for anything else. */
export function energyLevel(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= ENERGY_LEVELS
    ? value
    : null
}

/** What an entry shows: the DJ's rating when there is one, the estimate otherwise. */
export function entryEnergy(
  scale: EnergyScale,
  entry: SetlistEntry | undefined,
  track: Track,
): EntryEnergy | null {
  return ratedOrEstimated(scale, energyLevel(entry?.energy), track)
}

function ratedOrEstimated(
  scale: EnergyScale,
  rated: number | null,
  track: Track,
): EntryEnergy | null {
  if (rated !== null) return { level: rated, rated: true }
  const estimate = estimateEnergy(scale, track)
  return estimate === null ? null : { level: estimate, rated: false }
}

/** Tagged track id or signature → the level the DJ gave that track in some set. */
export type RatingIndex = ReadonlyMap<string, number>

// Ids and signatures share one map, so each is tagged: an id that reads like
// `artist|title` must not match that song.
function idKey(id: string): string {
  return `id:${id}`
}

/** A blank manual entry has no signature, or every blank entry would share one rating. */
function signatureKey(track: Track): string | null {
  const key = trackKey(track)
  return key.endsWith('|') ? null : `sig:${key}`
}

/**
 * Every rating across the DJ's sets. The signature lets a rating follow the song to a
 * copy with another id, e.g. the library import of a catalog track. When two sets rate
 * the same track differently the first in set order wins, so the answer never depends
 * on anything but the sets.
 */
export function buildRatingIndex(
  setlists: readonly Setlist[],
  resolve: (id: string) => Track | null,
): RatingIndex {
  const ratings = new Map<string, number>()
  if (!Array.isArray(setlists)) return ratings

  // Sets come back from localStorage and the database, so each field is checked.
  for (const setlist of setlists as unknown[]) {
    if (!setlist || typeof setlist !== 'object') continue
    const entries = (setlist as Record<string, unknown>).entries
    if (!Array.isArray(entries)) continue
    for (const entry of entries as unknown[]) {
      if (!entry || typeof entry !== 'object') continue
      const record = entry as Record<string, unknown>
      const level = energyLevel(record.energy)
      if (level === null || typeof record.trackId !== 'string' || !record.trackId) continue

      const track = resolve(record.trackId)
      for (const key of [idKey(record.trackId), track ? signatureKey(track) : null]) {
        if (key !== null && !ratings.has(key)) ratings.set(key, level)
      }
    }
  }
  return ratings
}

/** A pool track's energy: a rating from any set when there is one, the estimate otherwise. */
export function trackEnergy(
  scale: EnergyScale,
  ratings: RatingIndex,
  track: Track,
): EntryEnergy | null {
  const signature = signatureKey(track)
  const rated =
    ratings.get(idKey(track.id)) ?? (signature !== null ? ratings.get(signature) : undefined)
  return ratedOrEstimated(scale, rated ?? null, track)
}
