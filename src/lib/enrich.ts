import { normalizeTitle } from './suggest'
import type { SongHit } from './getsongbpm'
import type { ChartEntry } from './tracklists'
import type { Track } from './types'

/**
 * Chart pages give names, the lookup service gives tempo and key. Matching the
 * two is the fragile part: chart credits list every collaborator while the
 * lookup indexes one main artist, so a query built from the raw credit line
 * usually returns nothing.
 */

/** The first name before an ampersand, comma or "feat" — the one worth querying. */
export function primaryArtist(artist: string): string {
  const first = artist.split(/\s*(?:&|,|\bfeat\.?\b|\bft\.?\b|\bwith\b|\bx\b)\s*/i)[0]
  return first.trim()
}

export function lookupQuery(entry: Pick<ChartEntry, 'artist' | 'title'>): string {
  const artist = primaryArtist(entry.artist)
  return artist ? `${artist} - ${entry.title}` : entry.title
}

function words(text: string): string[] {
  return normalizeTitle(text).split(' ').filter(Boolean)
}

/** How much of the shorter title the two share, 0–1. */
export function titleOverlap(left: string, right: string): number {
  const a = words(left)
  const b = words(right)
  if (a.length === 0 || b.length === 0) return 0

  const pool = new Set(b)
  const shared = a.filter((word) => pool.has(word)).length
  return shared / Math.min(a.length, b.length)
}

const MIN_TITLE_OVERLAP = 0.75

/**
 * Picks the hit that is really the same record. A wrong match is worse than no
 * match: it would put a stranger's tempo on the track and quietly break a set.
 */
export function pickHit(entry: Pick<ChartEntry, 'artist' | 'title'>, hits: SongHit[]): SongHit | null {
  const artist = normalizeTitle(primaryArtist(entry.artist))

  let best: SongHit | null = null
  let bestScore = 0

  for (const hit of hits) {
    if (typeof hit.bpm !== 'number' || !hit.key) continue

    const overlap = titleOverlap(entry.title, hit.title)
    if (overlap < MIN_TITLE_OVERLAP) continue

    // An artist match breaks ties between covers and remakes of the same title.
    const artistMatch = artist && titleOverlap(artist, hit.artist) >= 0.5 ? 1 : 0
    const score = overlap + artistMatch

    if (score > bestScore) {
      best = hit
      bestScore = score
    }
  }

  return best
}

export function toTrack(entry: ChartEntry, hit: SongHit): Track {
  return {
    id: `tl:${entry.id}`,
    title: entry.title,
    // The chart credit is the fuller one; keep it so search can find either name.
    artist: entry.artist || hit.artist,
    bpm: hit.bpm,
    key: hit.key,
    source: 'catalog',
  }
}
