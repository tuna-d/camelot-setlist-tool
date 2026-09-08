import { trackKey } from './suggest'
import type { Track } from './types'

const COMBINING = /\p{M}+/gu

export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING, '')
    .replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function queryWords(query: string): string[] {
  const folded = fold(query)
  return folded ? folded.split(' ') : []
}

const TITLE_START = 6
const TITLE_CONTAINS = 4
const ARTIST_START = 3
const ARTIST_CONTAINS = 2
const LIBRARY_BONUS = 2

function wordScore(
  haystack: string,
  word: string,
  startPoints: number,
  containsPoints: number,
): number {
  if (!haystack.includes(word)) return 0
  const atStart = haystack.startsWith(word) || haystack.includes(` ${word}`)
  return atStart ? startPoints : containsPoints
}

interface Scored {
  track: Track
  score: number
  title: string
}

function scoreTrack(track: Track, words: string[]): Scored | null {
  const title = fold(track.title)
  const artist = fold(track.artist)
  let score = 0

  for (const word of words) {
    const inTitle = wordScore(title, word, TITLE_START, TITLE_CONTAINS)
    const inArtist = wordScore(artist, word, ARTIST_START, ARTIST_CONTAINS)
    if (inTitle === 0 && inArtist === 0) return null
    score += Math.max(inTitle, inArtist)
  }

  if (track.source === 'library') score += LIBRARY_BONUS
  if (title.startsWith(words.join(' '))) score += 3

  return { track, score, title }
}

export function localSearch(query: string, pool: Track[], limit = 30): Track[] {
  const words = queryWords(query)
  if (words.length === 0) return []

  const scored: Scored[] = []
  for (const track of pool) {
    const match = scoreTrack(track, words)
    if (match) scored.push(match)
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.title.length !== b.title.length) return a.title.length - b.title.length
    return a.title.localeCompare(b.title, 'tr')
  })

  return scored.slice(0, limit).map((item) => item.track)
}

export function dedupeBySignature(list: Track[]): Track[] {
  const positions = new Map<string, number>()
  const out: Track[] = []

  for (const track of list) {
    const signature = trackKey(track)
    const index = positions.get(signature)
    if (index === undefined) {
      positions.set(signature, out.length)
      out.push(track)
      continue
    }
    if (out[index].source !== 'library' && track.source === 'library') out[index] = track
  }

  return out
}
