/**
 * Beatport tür sayfalarından keşif katalogu çıkarımı.
 *
 * Beatport'un açık bir API'si yok; tür Top 100 sayfaları sunucu tarafında
 * render ediliyor. Sayfa yapısı haber vermeden değişiyor, o yüzden burada
 * üç ayrı çıkarım stratejisi sırayla deneniyor ve sonuç ayrıca doğrulanıyor.
 * Bozuk veri iyi veriyi asla ezmemeli — `validateCatalog` bunun için var.
 */

import { toCamelot } from './camelot'
import type { Track } from './types'

export interface BeatportGenre {
  slug: string
  id: number
  label: string
}

export const BEATPORT_GENRES: BeatportGenre[] = [
  { slug: 'melodic-house-techno', id: 90, label: 'Melodic House & Techno' },
  { slug: 'techno-peak-time-driving', id: 6, label: 'Techno (Peak Time / Driving)' },
  { slug: 'techno-raw-deep-hypnotic', id: 92, label: 'Techno (Raw / Deep / Hypnotic)' },
  { slug: 'tech-house', id: 11, label: 'Tech House' },
  { slug: 'progressive-house', id: 15, label: 'Progressive House' },
  { slug: 'house', id: 5, label: 'House' },
  { slug: 'deep-house', id: 12, label: 'Deep House' },
  { slug: 'minimal-deep-tech', id: 14, label: 'Minimal / Deep Tech' },
  { slug: 'indie-dance', id: 37, label: 'Indie Dance' },
]

export function genreUrl(genre: BeatportGenre): string {
  return `https://www.beatport.com/genre/${genre.slug}/${genre.id}/top-100`
}

/** Bir stratejinin sonucuna güvenmek için gereken en az parça sayısı. */
export const MIN_TRACKS_PER_STRATEGY = 10

/**
 * `start` konumundaki `{` ile eşleşen `}`'in konumu; yoksa −1.
 * Dize içindeki süslü parantezler ve kaçış karakterleri atlanır — regex ile
 * kesmek iç içe nesnelerde bozuk JSON üretiyor, bu yüzden sayarak yürüyoruz.
 */
function matchingBrace(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** Bir konumdan geriye doğru en fazla `limit` tane `{` konumu. */
function braceStartsBefore(text: string, index: number, limit: number): number[] {
  const out: number[] = []
  for (let i = index; i >= 0 && out.length < limit; i -= 1) {
    if (text[i] === '{') out.push(i)
  }
  return out
}

/**
 * Metindeki, `needle` geçen en küçük geçerli JSON nesnelerini çıkarır.
 * Gömülü betiklerin içinden veri kazımanın tek güvenli yolu bu: parantez sayan,
 * dize ve kaçış duyarlı bir tarayıcı.
 */
export function scanJsonObjects(text: string, needle: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const seen = new Set<number>()
  let cursor = 0

  while (cursor < text.length) {
    const hit = text.indexOf(needle, cursor)
    if (hit === -1) break
    cursor = hit + needle.length

    let parsed: Record<string, unknown> | null = null
    // En yakın `{`'ten başlayıp dışa doğru genişle: en küçük geçerli nesneyi al.
    for (const start of braceStartsBefore(text, hit, 60)) {
      if (seen.has(start)) break
      const end = matchingBrace(text, start)
      if (end === -1 || end < hit) continue
      try {
        const value: unknown = JSON.parse(text.slice(start, end + 1))
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          parsed = value as Record<string, unknown>
          seen.add(start)
          cursor = end + 1
          break
        }
      } catch {
        // Bu `{` bir nesnenin başı değil ya da nesne yarım; bir dışarıdakini dene.
      }
    }

    if (parsed) out.push(parsed)
  }

  return out
}

/** <90 yarım tempo, >165 çift tempo sayılır — Beatport ikisini de yazabiliyor. */
export function normalizeBpm(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return bpm
  if (bpm < 90) return bpm * 2
  if (bpm > 165) return bpm / 2
  return bpm
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function pick(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key]
  }
  return undefined
}

/** İç içe `{ name: … }` ya da düz metin gelebilen alanları tek biçime indirir. */
function nameOf(value: unknown): string | null {
  if (typeof value === 'string') return asString(value)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return asString((value as Record<string, unknown>).name)
  }
  return null
}

function artistsOf(value: unknown): string | null {
  if (Array.isArray(value)) {
    const names = value.map(nameOf).filter((name): name is string => Boolean(name))
    return names.length > 0 ? names.join(', ') : null
  }
  return nameOf(value)
}

/**
 * JSON nesnesini parçaya çevirir. Alan adları sürüme göre değişebildiği için
 * her alan birkaç yazımla aranıyor; tempo ya da key yoksa parça alınmıyor.
 */
function readTrackObject(source: Record<string, unknown>, fallbackGenre?: string): Track | null {
  const title = nameOf(pick(source, ['name', 'title', 'track_name']))
  const bpm = asNumber(pick(source, ['bpm', 'tempo']))
  if (!title || bpm === null) return null

  const key = toCamelot(nameOf(pick(source, ['key', 'key_name', 'camelot', 'keyName'])))
  if (!key) return null

  const artist = artistsOf(pick(source, ['artists', 'artist', 'artist_name'])) ?? 'Bilinmeyen'
  const genre = nameOf(pick(source, ['genre', 'genre_name'])) ?? fallbackGenre
  const id = asNumber(pick(source, ['id', 'track_id']))

  return {
    id: id === null ? `bp:${artist}:${title}` : `bp:${id}`,
    title,
    artist,
    bpm: normalizeBpm(bpm),
    key,
    genre,
    source: 'catalog',
  }
}

/** İç içe JSON'da parçaya benzeyen her nesneyi toplar. */
function walkForTracks(value: unknown, fallbackGenre: string | undefined, out: Track[]): void {
  if (Array.isArray(value)) {
    for (const item of value) walkForTracks(item, fallbackGenre, out)
    return
  }
  if (!value || typeof value !== 'object') return

  const record = value as Record<string, unknown>
  const track = readTrackObject(record, fallbackGenre)
  if (track) out.push(track)

  for (const child of Object.values(record)) walkForTracks(child, fallbackGenre, out)
}

function dedupe(tracks: Track[]): Track[] {
  const seen = new Set<string>()
  const out: Track[] = []
  for (const track of tracks) {
    const signature = `${track.artist.toLowerCase()}|${track.title.toLowerCase()}`
    if (seen.has(signature)) continue
    seen.add(signature)
    out.push(track)
  }
  return out
}

/** `__NEXT_DATA__` betiği: sayfanın kendi verdiği veri, en güvenilir kaynak. */
function fromNextData(html: string, genre?: string): Track[] {
  const match = /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i.exec(html)
  if (!match) return []
  try {
    const data: unknown = JSON.parse(match[1])
    const out: Track[] = []
    walkForTracks(data, genre, out)
    return dedupe(out)
  } catch {
    return []
  }
}

/** Gömülü JSON / RSC akışı (`self.__next_f.push`): veri kaçış karakterleriyle gelir. */
function fromEmbeddedJson(html: string, genre?: string): Track[] {
  const out: Track[] = []
  for (const candidate of scanJsonObjects(html, '"bpm"')) {
    const track = readTrackObject(candidate, genre)
    if (track) out.push(track)
  }

  // RSC akışında veri bir dize içinde kaçışlı duruyor; kaçışları çözüp tekrar bak.
  if (out.length < MIN_TRACKS_PER_STRATEGY && html.includes('__next_f')) {
    const unescaped = html.replace(/\\"/g, '"').replace(/\\n/g, '\n')
    for (const candidate of scanJsonObjects(unescaped, '"bpm"')) {
      const track = readTrackObject(candidate, genre)
      if (track) out.push(track)
    }
  }

  return dedupe(out)
}

/**
 * Düz HTML metni: satırlarda `"125 BPM - G Minor"` gibi bir metin ve
 * `/track/`, `/artist/` bağlantıları var. En kırılgan strateji, en son denenir.
 */
function fromPlainHtml(html: string, genre?: string): Track[] {
  const out: Track[] = []
  const segments = html.split('/track/')

  for (let i = 1; i < segments.length; i += 1) {
    const segment = segments[i].slice(0, 3000)
    const idMatch = /^[^"'<>]*?\/(\d+)/.exec(segment)
    const titleMatch = /^[^>]*>\s*([^<]{1,200}?)\s*</.exec(segment)
    const artistMatch = /\/artist\/[^"'<>]*?["'][^>]*>\s*([^<]{1,120}?)\s*</.exec(segment)
    const metaMatch = /(\d{2,3}(?:\.\d+)?)\s*BPM\s*[-–—]\s*([^<\n]{1,24}?)\s*(?:<|$)/i.exec(segment)
    if (!titleMatch || !metaMatch) continue

    const key = toCamelot(metaMatch[2])
    if (!key) continue

    out.push({
      id: idMatch ? `bp:${idMatch[1]}` : `bp:${titleMatch[1]}`,
      title: titleMatch[1],
      artist: artistMatch ? artistMatch[1] : 'Bilinmeyen',
      bpm: normalizeBpm(Number.parseFloat(metaMatch[1])),
      key,
      genre,
      source: 'catalog',
    })
  }

  return dedupe(out)
}

export interface ExtractResult {
  tracks: Track[]
  /** Hangi stratejinin tuttuğu — sayfa yapısı değişince buradan anlaşılır. */
  strategy: 'next-data' | 'embedded-json' | 'plain-html' | 'none'
}

/**
 * Sayfadan parçaları çıkarır: üç strateji sırayla denenir, ilk **güvenilir**
 * sonuç kazanır. 10'dan az parça bulan stratejiye güvenilmez — sayfa değişmiş
 * ve elimizde kırıntı kalmış olabilir.
 */
export function extractTracks(html: string, genre?: string): ExtractResult {
  if (typeof html !== 'string' || !html.trim()) return { tracks: [], strategy: 'none' }

  const strategies = [
    { name: 'next-data' as const, run: fromNextData },
    { name: 'embedded-json' as const, run: fromEmbeddedJson },
    { name: 'plain-html' as const, run: fromPlainHtml },
  ]

  let best: ExtractResult = { tracks: [], strategy: 'none' }
  for (const strategy of strategies) {
    const tracks = strategy.run(html, genre)
    if (tracks.length >= MIN_TRACKS_PER_STRATEGY) return { tracks, strategy: strategy.name }
    if (tracks.length > best.tracks.length) best = { tracks, strategy: strategy.name }
  }

  // Hiçbiri eşiği geçemedi: en çok bulanı döndür ama doğrulama bunu zaten eleyecek.
  return best
}

export interface ValidationStats {
  count: number
  keyRate: number
  bpmRate: number
  genreCount: number
}

export interface ValidationResult {
  ok: boolean
  /** Geçmediyse her reddetme sebebi ayrı bir cümle olarak. */
  reasons: string[]
  stats: ValidationStats
}

export const MIN_CATALOG_TRACKS = 100
const MIN_KEY_RATE = 0.95
const MIN_BPM_RATE = 0.9
const MIN_GENRES = 3
const BPM_FLOOR = 90
const BPM_CEILING = 165

/**
 * Yeni katalogun yayına alınabilir olup olmadığı.
 * Beatport sayfası değiştiğinde çıkarım sessizce yarım veri üretiyor; bu eşikler
 * o yarım veriyi yakalayıp eski katalogun korunmasını sağlıyor.
 */
export function validateCatalog(next: Track[], prev: Track[] = []): ValidationResult {
  const count = next.length
  const keyRate = count > 0 ? next.filter((track) => track.key !== null).length / count : 0
  const inRange = next.filter(
    (track) => track.bpm !== null && track.bpm >= BPM_FLOOR && track.bpm <= BPM_CEILING,
  ).length
  const bpmRate = count > 0 ? inRange / count : 0
  const genreCount = new Set(next.map((track) => track.genre).filter(Boolean)).size

  const reasons: string[] = []
  if (count < MIN_CATALOG_TRACKS) {
    reasons.push(
      `Katalogda yalnızca ${count} parça var, en az ${MIN_CATALOG_TRACKS} bekleniyor. Beatport sayfa yapısı değişmiş olabilir; beatport.ts içindeki çıkarım stratejilerini gözden geçir.`,
    )
  }
  if (keyRate < MIN_KEY_RATE) {
    reasons.push(
      `Parçaların yalnızca %${Math.round(keyRate * 100)}'inin key'i okunabildi, en az %95 bekleniyor. Key metninin biçimi değişmiş olabilir (toCamelot büyük/küçük harf duyarsız çalışmalı).`,
    )
  }
  if (bpmRate < MIN_BPM_RATE) {
    reasons.push(
      `Temposu ${BPM_FLOOR}–${BPM_CEILING} arasında olan parça oranı %${Math.round(bpmRate * 100)}, en az %90 bekleniyor. BPM alanı yanlış kolondan okunuyor olabilir.`,
    )
  }
  if (genreCount < MIN_GENRES) {
    reasons.push(
      `Katalogda ${genreCount} tür var, en az ${MIN_GENRES} bekleniyor. Tür sayfalarının çoğu hata vermiş olabilir; rapor satırlarına bak.`,
    )
  }
  if (prev.length > 0 && count < prev.length / 2) {
    reasons.push(
      `Yeni katalog (${count}) eskisinin (${prev.length}) yarısından küçük. Eski katalog korunuyor; çıkarımı düzeltmeden tazeleme yapma.`,
    )
  }

  return { ok: reasons.length === 0, reasons, stats: { count, keyRate, bpmRate, genreCount } }
}
