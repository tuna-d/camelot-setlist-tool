import { dedupeBySignature } from './search'
import type { Track } from './types'

/**
 * The 1001tracklists charts are small — a few dozen tracks a week — so a run
 * adds to the catalog rather than replacing it. The pool grows week by week and
 * a single bad run can never shrink it.
 */

export const CATALOG_CAP = 1500

const MIN_USABLE = 10
const MIN_KEY_RATE = 0.6
const MIN_BPM_RATE = 0.8
const BPM_FLOOR = 90
const BPM_CEILING = 165

export interface DiscoveryStats {
  incoming: number
  usable: number
  keyRate: number
  bpmRate: number
}

export interface DiscoveryResult {
  ok: boolean
  reasons: string[]
  stats: DiscoveryStats
}

/** Only tracks with both a tempo and a key can feed a suggestion. */
export function usableTracks(tracks: Track[]): Track[] {
  return tracks.filter((track) => typeof track.bpm === 'number' && track.bpm > 0 && !!track.key)
}

export function validateDiscovery(incoming: Track[]): DiscoveryResult {
  const usable = usableTracks(incoming)
  const inRange = usable.filter(
    (track) => track.bpm !== null && track.bpm >= BPM_FLOOR && track.bpm <= BPM_CEILING,
  )

  const keyRate = incoming.length === 0 ? 0 : usable.length / incoming.length
  const bpmRate = usable.length === 0 ? 0 : inRange.length / usable.length
  const reasons: string[] = []

  if (usable.length < MIN_USABLE) {
    reasons.push(
      `Only ${usable.length} tracks came back with both a tempo and a key, at least ${MIN_USABLE} expected. The lookup service may be down, or the chart page may have changed.`,
    )
  }

  if (keyRate < MIN_KEY_RATE) {
    reasons.push(
      `Only ${Math.round(keyRate * 100)}% of the chart entries could be matched to a tempo and key, at least ${Math.round(MIN_KEY_RATE * 100)}% expected. Track titles may need cleaning before the lookup.`,
    )
  }

  if (bpmRate < MIN_BPM_RATE) {
    reasons.push(
      `Only ${Math.round(bpmRate * 100)}% of the tempos fall between ${BPM_FLOOR} and ${BPM_CEILING}, at least ${Math.round(MIN_BPM_RATE * 100)}% expected. The lookup may be returning the wrong tracks.`,
    )
  }

  return {
    ok: reasons.length === 0,
    reasons,
    stats: {
      incoming: incoming.length,
      usable: usable.length,
      keyRate: Math.round(keyRate * 1000) / 1000,
      bpmRate: Math.round(bpmRate * 1000) / 1000,
    },
  }
}

/**
 * Fresh tracks come first so the newest chart survives the cap, and the previous
 * catalog follows. De-duplication is by artist+title signature, not by id: the
 * same record has a different id in every source.
 */
export function mergeCatalog(previous: Track[], incoming: Track[], cap = CATALOG_CAP): Track[] {
  const merged = dedupeBySignature([...usableTracks(incoming), ...previous])
  return cap > 0 ? merged.slice(0, cap) : merged
}
