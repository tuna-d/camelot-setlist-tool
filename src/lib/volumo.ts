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

/**
 * "Forbidden Society, Drumago — Trashstar (Drumago Remix)" → artist and title.
 * Splits on the first separator only: the title may hold dashes of its own.
 */
export function splitCredit(credit: string): { artist: string; title: string } | null {
  const match = /^(.{1,150}?)\s+[—–·-]\s+(.+)$/.exec(credit.trim())
  if (!match) return null
  const artist = match[1].trim()
  const title = match[2].trim()
  return title ? { artist, title } : null
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
  const positions = new Map<string, number>()
  // Server-rendered React splits interpolated text with comment markers, which
  // would cut "Trashstar (Drumago Remix)" down to "Trashstar (".
  const blocks = html.replace(/<!--.*?-->/g, '').split(/href="\/track\//)

  for (const block of blocks.slice(1)) {
    const slug = /^([0-9]+)-[^"]*"/.exec(block)
    if (!slug) continue

    const id = slug[1]

    // A remix title is split across several anchors ("Trashstar (" + a link to
    // the remixer + " Remix)"), so the anchor text alone is a fragment. The play
    // button beside it carries the whole credit line, which is what we read.
    const credit = pick(block, /aria-label="Play &quot;([^"]{3,300})&quot;"/i)
    const named = credit ? splitCredit(credit) : null

    const title = named?.title ?? pick(block, /^[^>]*>\s*([^<]{1,200})</)
    if (!title) continue

    const artist = named?.artist ?? pick(block, /data-test-id="artists"[^>]*>([\s\S]{0,400}?)<\/span>/i)
    const bpmText = pick(block, /data-test-id="bpm"[^>]*>\s*([0-9]+(?:\.[0-9]+)?)/i)
    const keyText = pick(block, /data-test-id="keysign"[^>]*>\s*([^<]{1,30})</i)
    const genre = pick(block, /TrackSecondaryData_genre[^"]*"\s+href="\/[^"]+"\s*>([^<]{1,60})</i)
    const duration = parseDuration(pick(block, /data-test-id="duration"[^>]*>\s*([0-9:]{3,8})</i))

    const bpm = bpmText ? Number.parseFloat(bpmText) : Number.NaN

    const track: Track = {
      id: `vl:${id}`,
      title,
      artist: artist ?? '',
      bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null,
      key: toCamelot(keyText),
      genre: genre ?? fallbackGenre,
      duration,
      source: 'catalog',
    }

    // A track can be linked twice on a page: once in the full row with the tempo
    // and key badges, once in a bare list. Merge field by field rather than
    // letting the second, thinner occurrence overwrite a good row.
    const at = positions.get(id)
    if (at === undefined) {
      positions.set(id, tracks.length)
      tracks.push(track)
      continue
    }

    const stored = tracks[at]
    tracks[at] = {
      ...stored,
      title: stored.title.length >= track.title.length ? stored.title : track.title,
      artist: stored.artist || track.artist,
      bpm: stored.bpm ?? track.bpm,
      key: stored.key ?? track.key,
      genre: stored.genre ?? track.genre,
      duration: stored.duration ?? track.duration,
    }
  }

  return tracks
}
