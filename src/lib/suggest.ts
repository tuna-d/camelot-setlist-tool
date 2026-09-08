/**
 * Aday parçaların puanlanması: harmonik ilişki ile tempo yakınlığını tek sayıda birleştirir.
 *
 * Puan = ilişki puanı × 0.66 + tempo yakınlığı × 0.34. Ağırlık key'den yana, çünkü
 * pitch ile tempo bir yere kadar zorlanabilir ama uyumsuz key kabinde duyulur.
 */

import { RELATIONS, relation, relationInfo } from './camelot'
import type { RelationInfo } from './camelot'
import type { RelationId, Track } from './types'

/** Pioneer DDJ-FLX4'ün pitch aralığı ±%6; varsayılan tolerans buradan geliyor. */
export const DEFAULT_TOLERANCE = 6
export const MIN_TOLERANCE = 1
export const MAX_TOLERANCE = 12

const RELATION_WEIGHT = 0.66
const TEMPO_WEIGHT = 0.34

export interface BpmDelta {
  /** İşaretsiz fark. */
  abs: number
  /** İşaretli fark: aday referanstan hızlıysa artı. */
  signed: number
  /** Yarım/çift tempo eşleşmesi kullanıldı mı. */
  halved: boolean
  /** Adayın karşılaştırmada kullanılan (gerekirse ikiye katlanmış) temposu. */
  matched: number
}

/**
 * İki tempo arasındaki fark. 128 ↔ 64 ↔ 256 geçerli bir eşleşmedir: aynı parçanın
 * yarım ya da çift tempoyla etiketlenmesi sık, bunu fark saymak iyi adayları eliyor.
 * İşaret korunur — arayüzde pitch'i hangi yöne çevireceğini görmek gerekiyor.
 */
export function bpmDelta(ref: number, cand: number): BpmDelta {
  const options = [cand, cand * 2, cand / 2]
  let best = cand
  let bestDistance = Number.POSITIVE_INFINITY
  for (const option of options) {
    const distance = Math.abs(option - ref)
    if (distance < bestDistance) {
      bestDistance = distance
      best = option
    }
  }
  const signed = best - ref
  return {
    abs: Math.abs(signed),
    signed,
    halved: best !== cand,
    matched: best,
  }
}

/** `0` farkı "tam", gerisi işaretli ve tek ondalıklı: `+2.0`, `−1.5`. */
export function formatDelta(delta: BpmDelta | number): string {
  const signed = typeof delta === 'number' ? delta : delta.signed
  const rounded = Math.round(signed * 10) / 10
  if (rounded === 0) return 'tam'
  // Eksi işareti tipografik (U+2212): sayı sütunlarında tire gibi kırılmıyor.
  return rounded > 0 ? `+${rounded.toFixed(1)}` : `−${Math.abs(rounded).toFixed(1)}`
}

/** Verilen tempo ve toleransla aranacak aralık — arayüzdeki "hedef BPM" rozeti bunu gösterir. */
export function bpmRange(bpm: number, tolerance: number): { min: number; max: number } {
  const span = (bpm * tolerance) / 100
  return { min: bpm - span, max: bpm + span }
}

// Aynı parçanın farklı yazımlarını eşitlemek için atılan sürüm etiketleri.
// Remix adları bilerek korunuyor: remix ayrı bir parçadır, aynı parça değil.
const VERSION_NOISE = /\((original|extended|radio|club|vocal)(\s+(mix|edit|version))?\)/gi
const FEATURING = /\s(feat|ft|featuring)\.?\s.*$/i

/** Başlığı karşılaştırılabilir hâle getirir: sürüm etiketi, feat. eki ve noktalama gider. */
export function normalizeTitle(title: string): string {
  return title
    .replace(VERSION_NOISE, ' ')
    .replace(FEATURING, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function normalizeArtist(artist: string): string {
  return artist
    .replace(FEATURING, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * Parçanın kaynaktan bağımsız kimliği. Katalogdan ve kütüphaneden gelen aynı parça
 * bu imzada buluşur; öneri listesinde iki kez görünmesini bu engelliyor.
 */
export function trackKey(track: Track): string {
  return `${normalizeArtist(track.artist)}|${normalizeTitle(track.title)}`
}

export interface Suggestion {
  track: Track
  /** 0–100 arası birleşik puan. */
  score: number
  relation: RelationId
  delta: BpmDelta
}

/** Türler serbest metin: rekordbox "Techno", Beatport "Techno (Peak Time / Driving)" yazıyor. */
function genreMatches(track: Track, genres: string[]): boolean {
  if (genres.length === 0) return true
  // Türü olmayan parça süzgece takılmaz; etiketsiz diye elemek kütüphaneyi yarıya indirirdi.
  if (!track.genre) return true
  const value = track.genre.toLowerCase()
  return genres.some((genre) => {
    const wanted = genre.toLowerCase()
    return value.includes(wanted) || wanted.includes(value)
  })
}

/**
 * Tek bir adayın puanı. Tolerans dışındaki tempo ve kapalı ilişki elenir (`null`).
 */
export function scoreCandidate(
  ref: Track,
  cand: Track,
  tolerance: number,
  allowed: RelationId[],
): Suggestion | null {
  if (ref.bpm === null || ref.key === null) return null
  if (cand.bpm === null || cand.key === null) return null

  const id = relation(ref.key, cand.key)
  if (!id || !allowed.includes(id)) return null

  const info = relationInfo(id)
  if (!info) return null

  const delta = bpmDelta(ref.bpm, cand.bpm)
  const limit = (ref.bpm * tolerance) / 100
  if (delta.abs > limit) return null

  // Tolerans sınırında tempo yakınlığı 0, tam isabette 100.
  const closeness = limit > 0 ? 100 * (1 - delta.abs / limit) : delta.abs === 0 ? 100 : 0
  const score = info.score * RELATION_WEIGHT + closeness * TEMPO_WEIGHT

  return { track: cand, score, relation: id, delta }
}

export interface SuggestOptions {
  tolerance: number
  relations: RelationId[]
  /** Boşsa tür süzgeci uygulanmaz. */
  genres?: string[]
  /** Elenecek parça kimlikleri ya da `trackKey` imzaları. */
  exclude?: Set<string>
  limit?: number
}

/**
 * Havuzdan referans parçaya en uygun adayları puana göre sıralı verir.
 * Sıralama kararlı: eşit puanda önce tempo farkı, sonra imza karşılaştırılır.
 */
export function suggest(ref: Track, pool: Track[], opts: SuggestOptions): Suggestion[] {
  const exclude = opts.exclude ?? new Set<string>()
  const genres = opts.genres ?? []
  const refKey = trackKey(ref)
  const seen = new Set<string>()
  const out: Suggestion[] = []

  for (const cand of pool) {
    if (cand.id === ref.id) continue
    const key = trackKey(cand)
    if (key === refKey) continue
    if (exclude.has(cand.id) || exclude.has(key)) continue
    if (seen.has(key)) continue
    if (!genreMatches(cand, genres)) continue

    const scored = scoreCandidate(ref, cand, opts.tolerance, opts.relations)
    if (!scored) continue

    seen.add(key)
    out.push(scored)
  }

  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.delta.abs !== b.delta.abs) return a.delta.abs - b.delta.abs
    return trackKey(a.track).localeCompare(trackKey(b.track))
  })

  return typeof opts.limit === 'number' ? out.slice(0, opts.limit) : out
}

export interface SuggestionGroup {
  info: RelationInfo
  items: Suggestion[]
}

/** Önerileri ilişkiye göre, `RELATIONS` sırasını koruyarak gruplar. Boş gruplar düşer. */
export function groupByRelation(list: Suggestion[]): SuggestionGroup[] {
  return RELATIONS.map((info) => ({
    info,
    items: list.filter((item) => item.relation === info.id),
  })).filter((group) => group.items.length > 0)
}
