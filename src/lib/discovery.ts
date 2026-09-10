import { lookupQuery, pickHit, toTrack } from './enrich'
import { dedupeBySignature } from './search'
import { extractChart } from './tracklists'
import type { SongHit } from './getsongbpm'
import type { ChartEntry } from './tracklists'
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

/**
 * `attempted` is how many chart entries were looked up; the matched tracks are
 * what came back. Comparing the two is the honest way to see a broken lookup.
 */
export function validateDiscovery(incoming: Track[], attempted = incoming.length): DiscoveryResult {
  const usable = usableTracks(incoming)
  const inRange = usable.filter(
    (track) => track.bpm !== null && track.bpm >= BPM_FLOOR && track.bpm <= BPM_CEILING,
  )

  const keyRate = attempted === 0 ? 0 : usable.length / attempted
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
      incoming: attempted,
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

export interface ChartReport {
  url: string
  found: number
  error: string | null
}

export interface CollectResult {
  tracks: Track[]
  entries: ChartEntry[]
  reports: ChartReport[]
  /** Chart names the lookup could not place, worth reading when the rate drops. */
  unmatched: string[]
}

export interface CollectOptions {
  pages: string[]
  fetchPage: (url: string) => Promise<string>
  lookup: (query: string) => Promise<SongHit[]>
  onStep?: (message: string) => void
}

/**
 * Reads the chart pages, then asks the lookup service for each entry.
 * Network calls are injected so the whole path is testable without one.
 */
export async function collectFromCharts(options: CollectOptions): Promise<CollectResult> {
  const { pages, fetchPage, lookup, onStep } = options

  const entries: ChartEntry[] = []
  const reports: ChartReport[] = []
  const seen = new Set<string>()

  for (const url of pages) {
    try {
      const found = extractChart(await fetchPage(url))
      const fresh = found.filter((entry) => !seen.has(entry.id))
      for (const entry of fresh) seen.add(entry.id)
      entries.push(...fresh)
      reports.push({ url, found: fresh.length, error: null })
    } catch (problem) {
      reports.push({
        url,
        found: 0,
        error: problem instanceof Error ? problem.message : String(problem),
      })
    }
  }

  const tracks: Track[] = []
  const unmatched: string[] = []

  for (const entry of entries) {
    const name = `${entry.artist} - ${entry.title}`.trim()
    try {
      const hit = pickHit(entry, await lookup(lookupQuery(entry)))
      if (hit) {
        tracks.push(toTrack(entry, hit))
        onStep?.(`matched ${name}`)
      } else {
        unmatched.push(name)
        onStep?.(`no match for ${name}`)
      }
    } catch (problem) {
      unmatched.push(name)
      onStep?.(`lookup failed for ${name}: ${problem instanceof Error ? problem.message : String(problem)}`)
    }
  }

  return { tracks, entries, reports, unmatched }
}
