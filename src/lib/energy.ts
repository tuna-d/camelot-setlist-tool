import { keyLetter } from './camelot'
import type { SetlistEntry, Track } from './types'

/**
 * Energy on a 1-5 scale. A rating the DJ gave is the truth; until then an estimate
 * is derived from where the track's tempo sits within its own genre. The estimate
 * is recomputed on every render and never stored, see docs/adr/0001.
 */

/** Below this many tempos a genre's spread is noise, so the whole pool is used. */
export const MIN_GENRE_TRACKS = 20

const LEVELS = 5
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
  // The pool comes from the catalog JSON or a rekordbox import, so each field is checked.
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
  const band = Math.floor(percentile(tempos, bpm) * LEVELS + nudge) + 1
  return Math.min(LEVELS, Math.max(1, band))
}

function ratedEnergy(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= LEVELS
    ? value
    : null
}

/** What an entry shows: the DJ's rating when there is one, the estimate otherwise. */
export function entryEnergy(
  scale: EnergyScale,
  entry: SetlistEntry | undefined,
  track: Track,
): EntryEnergy | null {
  const rated = ratedEnergy(entry?.energy)
  if (rated !== null) return { level: rated, rated: true }
  const estimate = estimateEnergy(scale, track)
  return estimate === null ? null : { level: estimate, rated: false }
}
