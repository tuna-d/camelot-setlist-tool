import { toCamelot } from './camelot'

export interface SongQuery {
  song: string
  artist: string
}

export interface SongHit {
  title: string
  artist: string
  bpm: number | null
  key: string | null
}

export interface SongSearchResult {
  results: SongHit[]
  message: string | null
}

// "Artist - Title" is the common spelling; with no dash the whole string is the title.
export function splitQuery(query: string): SongQuery {
  const text = query.trim()
  if (!text) return { song: '', artist: '' }
  const match = /^(.+?)\s+[-–—]\s+(.+)$/.exec(text)
  if (!match) return { song: text, artist: '' }
  return { artist: match[1].trim(), song: match[2].trim() }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function bpm(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

function artistName(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') return text((value as Record<string, unknown>).name)
  return ''
}

export function readSearchResults(body: unknown): SongSearchResult {
  if (!body || typeof body !== 'object') {
    return { results: [], message: 'The search service returned something unexpected. Try again later.' }
  }

  const search = (body as Record<string, unknown>).search
  if (search && typeof search === 'object' && !Array.isArray(search)) {
    const error = text((search as Record<string, unknown>).error)
    return {
      results: [],
      message: error
        ? `The search found nothing (${error}). Simplify the spelling or enter the track by hand.`
        : 'The search found nothing. Simplify the spelling or enter the track by hand.',
    }
  }
  if (!Array.isArray(search)) {
    return { results: [], message: 'The search service returned something unexpected. Try again later.' }
  }

  const results: SongHit[] = []
  for (const item of search) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const title = text(record.song_title) || text(record.title)
    if (!title) continue
    results.push({
      title,
      artist: artistName(record.artist),
      bpm: bpm(record.tempo),
      key: toCamelot(text(record.key_of)) ?? toCamelot(text(record.open_key)),
    })
  }

  return {
    results,
    message: results.length === 0 ? 'The search found nothing. You can enter the track by hand.' : null,
  }
}
