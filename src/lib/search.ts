/**
 * Yerel arama: kütüphane ve katalog içinde anında eşleşme.
 *
 * Türkçe yazarken kimse aksan işaretiyle uğraşmıyor — `"sarki soyle"` yazınca
 * `"Şarkı Söyle"` bulunmalı. Bu yüzden her metin aranmadan önce katlanıyor.
 */

import { trackKey } from './suggest'
import type { Track } from './types'

/** Ayrıştırılmış aksan işaretleri (`\p{M}`): NFD sonrası harften ayrılan kuyruklar. */
const COMBINING = /\p{M}+/gu

/**
 * Metni karşılaştırılabilir hâle getirir: küçük harf, aksansız, noktalamasız.
 * `ı` Unicode'da ayrı bir harf olduğu için ayrıca eşleniyor; `İ` küçük harfe
 * inince zaten birleşik nokta bırakıyor ve o da aksan temizliğinde düşüyor.
 */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING, '')
    .replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Sorguyu kelimelere ayırır; anlamsız girdi (`(((`) boş dizi verir. */
export function queryWords(query: string): string[] {
  const folded = fold(query)
  return folded ? folded.split(' ') : []
}

// Puanlar: kelime başı eşleşmesi içinde geçmesini, başlık sanatçıyı yener.
const TITLE_START = 6
const TITLE_CONTAINS = 4
const ARTIST_START = 3
const ARTIST_CONTAINS = 2
/** Kendi kütüphanendeki parça, katalogdaki aynı isimli parçadan önce gelsin. */
const LIBRARY_BONUS = 2

function wordScore(
  haystack: string,
  word: string,
  startPoints: number,
  containsPoints: number,
): number {
  if (!haystack.includes(word)) return 0
  // Kelime başı: metnin başında ya da bir boşluktan hemen sonra.
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
    // Çok kelimeli sorguda her kelime bir yerde geçmeli; biri tutmazsa parça elenir.
    if (inTitle === 0 && inArtist === 0) return null
    score += Math.max(inTitle, inArtist)
  }

  if (track.source === 'library') score += LIBRARY_BONUS
  // Sorgunun tamamı başlığın başındaysa tam isabet sayılır.
  if (title.startsWith(words.join(' '))) score += 3

  return { track, score, title }
}

/**
 * Havuzda arar. Sıralama kararlı: puan, sonra başlık uzunluğu, sonra alfabetik —
 * aynı sorgu her zaman aynı listeyi verir.
 */
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

/**
 * Aynı parçanın kopyalarını teke indirir; katalog ile kütüphane kopyası çakışırsa
 * kütüphanedeki kalır — onun dosya yolu var, sete eklenince m3u8'e yazılabiliyor.
 * Sıra korunur: kopya, ilk görüldüğü yerde durur.
 */
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
