/**
 * 1001tracklists chart pages. Unlike a shop chart these rank by how many DJs
 * actually played a track, which is the better signal for building a set.
 *
 * The pages carry no tempo or key, so entries here are only names; the tempo and
 * key come from GetSongBPM afterwards.
 */

export interface ChartEntry {
  /** The site's own track id, stable enough to de-duplicate a run. */
  id: string
  rank: number
  artist: string
  title: string
  label: string | null
  /** How many unique DJs played it in the last four weeks. */
  support: number | null
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  eacute: 'é',
  egrave: 'è',
  euml: 'ë',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
  aacute: 'á',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  ccedil: 'ç',
  szlig: 'ß',
  oslash: 'ø',
  aring: 'å',
  agrave: 'à',
  acirc: 'â',
  ecirc: 'ê',
  icirc: 'î',
  ocirc: 'ô',
  ucirc: 'û',
}

// No DOM in lib/, so entities are decoded by hand. Artist names need it:
// "Tiësto" arrives as "Ti&euml;sto" and would otherwise poison the search query.
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits: string) => codePoint(Number.parseInt(digits, 10)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? whole)
}

function codePoint(value: number): string {
  if (!Number.isFinite(value) || value < 1 || value > 0x10ffff) return ''
  try {
    return String.fromCodePoint(value)
  } catch {
    // Lone surrogates and other invalid points throw; dropping them is fine.
    return ''
  }
}

function clean(text: string): string {
  return decodeEntities(text.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function firstMatch(block: string, pattern: RegExp): string | null {
  const found = pattern.exec(block)
  return found ? clean(found[1]) : null
}

/**
 * Splits "Artist - Title" on the first separator only: a trailing
 * "- Extended Mix" belongs to the title, not to a second artist.
 */
export function splitName(name: string): { artist: string; title: string } {
  const match = /^(.+?)\s+[-–—]\s+(.+)$/.exec(name.trim())
  if (!match) return { artist: '', title: name.trim() }
  return { artist: match[1].trim(), title: match[2].trim() }
}

export function extractChart(html: string): ChartEntry[] {
  if (typeof html !== 'string' || html.length === 0) return []

  const entries: ChartEntry[] = []
  const seen = new Set<string>()

  for (const block of html.split(/(?=<div class="bItm)/)) {
    const link = /<a href="\/track\/([a-z0-9]+)\/[^"]*"[^>]*>([^<]+)<\/a>/i.exec(block)
    if (!link) continue

    const id = link[1]
    if (seen.has(id)) continue

    const { artist, title } = splitName(clean(link[2]))
    if (!title) continue

    const rank = firstMatch(block, /class="bRank"[^>]*>\s*([0-9]{1,3})/i)
    const label = firstMatch(block, /class="trackLabel[^"]*"[^>]*>\s*<a[^>]*>([^<]+)</i)
    const support = firstMatch(block, /Unique DJ Support:[\s\S]{0,200}?<span>\s*([0-9]+)\s*<\/span>/i)

    seen.add(id)
    entries.push({
      id,
      rank: rank ? Number.parseInt(rank, 10) : entries.length + 1,
      artist,
      title,
      label: label && label.length > 0 ? label : null,
      support: support ? Number.parseInt(support, 10) : null,
    })
  }

  return entries
}
