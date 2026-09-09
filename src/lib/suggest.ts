import { RELATIONS, relation, relationInfo } from './camelot'
import type { RelationInfo } from './camelot'
import type { RelationId, Track } from './types'

export const DEFAULT_TOLERANCE = 6
export const MIN_TOLERANCE = 1
export const MAX_TOLERANCE = 12

/**
 * Preset tolerance steps offered in the UI. 6% is the default because most entry
 * level controllers (the Pioneer DDJ-FLX4 included) have a ±6% pitch range.
 */
export const TOLERANCE_STEPS = [3, 6, 8, 10, 12]

const RELATION_WEIGHT = 0.66
const TEMPO_WEIGHT = 0.34

export interface BpmDelta {
  abs: number
  signed: number
  halved: boolean
  matched: number
}

// Half and double tempo are real matches: 128 = 64 = 256.
export function bpmDelta(ref: number, cand: number): BpmDelta {
  const options = [cand, cand * 2, cand / 2]
  let best = cand
  let bestDistance = Number.POSITIVE_INFINITY
  for (const option of options) {
    const distance = Math.abs(option - ref)
    if (distance < bestDistance) {
      bestDistance = distance
      best = option
    }
  }
  const signed = best - ref
  return {
    abs: Math.abs(signed),
    signed,
    halved: best !== cand,
    matched: best,
  }
}

export function formatDelta(delta: BpmDelta | number): string {
  const signed = typeof delta === 'number' ? delta : delta.signed
  const rounded = Math.round(signed * 10) / 10
  if (rounded === 0) return 'tam'
  return rounded > 0 ? `+${rounded.toFixed(1)}` : `−${Math.abs(rounded).toFixed(1)}`
}

export function bpmRange(bpm: number, tolerance: number): { min: number; max: number } {
  const span = (bpm * tolerance) / 100
  return { min: bpm - span, max: bpm + span }
}

const VERSION_NOISE = /\((original|extended|radio|club|vocal)(\s+(mix|edit|version))?\)/gi
const FEATURING = /\s(feat|ft|featuring)\.?\s.*$/i

export function normalizeTitle(title: string): string {
  return title
    .replace(VERSION_NOISE, ' ')
    .replace(FEATURING, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function normalizeArtist(artist: string): string {
  return artist
    .replace(FEATURING, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function trackKey(track: Track): string {
  return `${normalizeArtist(track.artist)}|${normalizeTitle(track.title)}`
}

export interface Suggestion {
  track: Track
  score: number
  relation: RelationId
  delta: BpmDelta
}

function genreMatches(track: Track, genres: string[]): boolean {
  if (genres.length === 0) return true
  if (!track.genre) return true
  const value = track.genre.toLowerCase()
  return genres.some((genre) => {
    const wanted = genre.toLowerCase()
    return value.includes(wanted) || wanted.includes(value)
  })
}

export function scoreCandidate(
  ref: Track,
  cand: Track,
  tolerance: number,
  allowed: RelationId[],
): Suggestion | null {
  if (ref.bpm === null || ref.key === null) return null
  if (cand.bpm === null || cand.key === null) return null

  const id = relation(ref.key, cand.key)
  if (!id || !allowed.includes(id)) return null

  const info = relationInfo(id)
  if (!info) return null

  const delta = bpmDelta(ref.bpm, cand.bpm)
  const limit = (ref.bpm * tolerance) / 100
  if (delta.abs > limit) return null

  const closeness = limit > 0 ? 100 * (1 - delta.abs / limit) : delta.abs === 0 ? 100 : 0
  const score = info.score * RELATION_WEIGHT + closeness * TEMPO_WEIGHT

  return { track: cand, score, relation: id, delta }
}

export interface SuggestOptions {
  tolerance: number
  relations: RelationId[]
  genres?: string[]
  exclude?: Set<string>
  limit?: number
}

export function suggest(ref: Track, pool: Track[], opts: SuggestOptions): Suggestion[] {
  const exclude = opts.exclude ?? new Set<string>()
  const genres = opts.genres ?? []
  const refKey = trackKey(ref)
  const seen = new Set<string>()
  const out: Suggestion[] = []

  for (const cand of pool) {
    if (cand.id === ref.id) continue
    const key = trackKey(cand)
    if (key === refKey) continue
    if (exclude.has(cand.id) || exclude.has(key)) continue
    if (seen.has(key)) continue
    if (!genreMatches(cand, genres)) continue

    const scored = scoreCandidate(ref, cand, opts.tolerance, opts.relations)
    if (!scored) continue

    seen.add(key)
    out.push(scored)
  }

  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.delta.abs !== b.delta.abs) return a.delta.abs - b.delta.abs
    return trackKey(a.track).localeCompare(trackKey(b.track))
  })

  return typeof opts.limit === 'number' ? out.slice(0, opts.limit) : out
}

export interface SuggestionGroup {
  info: RelationInfo
  items: Suggestion[]
}

export function groupByRelation(list: Suggestion[]): SuggestionGroup[] {
  return RELATIONS.map((info) => ({
    info,
    items: list.filter((item) => item.relation === info.id),
  })).filter((group) => group.items.length > 0)
}
