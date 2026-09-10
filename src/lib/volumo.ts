import { toCamelot } from './camelot'
import type { Track } from './types'

/**
 * Volumo chart pages. Beatport started answering 403 to this scraper in September
 * 2026 (from a home connection and from a CI runner alike), and its stand-ins —
 * BeatStats, Traxsource — sit behind the same wall while Juno Download has closed.
 * Volumo serves the same kind of data, and serves it better: tempo, key, genre and
 * length are all in the server-rendered HTML behind `data-test-id` hooks that exist
 * for their own tests, so they are far steadier than a class name.
 */

export const VOLUMO_BASE = 'https://volumo.com'
export const VOLUMO_CHARTS = `${VOLUMO_BASE}/charts`

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
}

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, digits: string) => {
      const value = Number.parseInt(digits, 10)
      return value > 0 && value < 0x10ffff ? String.fromCodePoint(value) : ''
    })
    .replace(/&([a-z#0-9]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole)
}

function clean(text: string): string {
  return decode(text.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function pick(block: string, pattern: RegExp): string | null {
  const found = pattern.exec(block)
  return found ? clean(found[1]) : null
}

/** "5:54" → 354. Unparseable input yields undefined rather than a wrong number. */
export function parseDuration(text: string | null): number | undefined {
  if (!text) return undefined
  const parts = text.split(':').map((part) => Number.parseInt(part, 10))
  if (parts.some((part) => !Number.isFinite(part))) return undefined
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return undefined
}

/** Chart addresses from the /charts index, in page order and without repeats. */
export function extractChartLinks(html: string): string[] {
  if (typeof html !== 'string') return []
  const links: string[] = []
  const seen = new Set<string>()

  for (const match of html.matchAll(/href="(\/chart\/[a-z0-9][^"#?]*)"/gi)) {
    const path = match[1]
    if (seen.has(path)) continue
    seen.add(path)
    links.push(`${VOLUMO_BASE}${path}`)
  }

  return links
}

/**
 * One row per track link. Every field is read from inside that row, so a missing
 * value in one row can never be filled from its neighbour.
 */
export function extractTracks(html: string, fallbackGenre?: string): Track[] {
  if (typeof html !== 'string' || html.length === 0) return []

  const tracks: Track[] = []
  const seen = new Set<string>()
  const blocks = html.split(/href="\/track\//)

  for (const block of blocks.slice(1)) {
    const slug = /^([0-9]+)-[^"]*"/.exec(block)
    if (!slug) continue

    const id = slug[1]
    if (seen.has(id)) continue

    const title = pick(block, /^[^>]*>\s*([^<]{1,200})</)
    if (!title) continue

    const artist = pick(block, /data-test-id="artists"[^>]*>([\s\S]{0,400}?)<\/span>/i)
    const bpmText = pick(block, /data-test-id="bpm"[^>]*>\s*([0-9]+(?:\.[0-9]+)?)/i)
    const keyText = pick(block, /data-test-id="keysign"[^>]*>\s*([^<]{1,30})</i)
    const genre = pick(block, /TrackSecondaryData_genre[^"]*"\s+href="\/[^"]+"\s*>([^<]{1,60})</i)
    const duration = parseDuration(pick(block, /data-test-id="duration"[^>]*>\s*([0-9:]{3,8})</i))

    const bpm = bpmText ? Number.parseFloat(bpmText) : Number.NaN

    seen.add(id)
    tracks.push({
      id: `vl:${id}`,
      title,
      artist: artist ?? '',
      bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null,
      key: toCamelot(keyText),
      genre: genre ?? fallbackGenre,
      duration,
      source: 'catalog',
    })
  }

  return tracks
}
