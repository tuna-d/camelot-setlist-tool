/**
 * Otomatik set kurucu: bir başlangıç parçasından yola çıkıp havuzdan set diziyor.
 *
 * Neden açgözlü değil de ışın araması (beam search): her adımda tek tek en iyi parçayı
 * seçmek, bir sonraki adımda hiç uyumlu aday kalmayan çıkmazlara sokuyor. Aynı anda
 * birkaç kısmi seti canlı tutunca bu sorun kayboluyor.
 */

import { relation, relationInfo } from './camelot'
import { bpmDelta, trackKey } from './suggest'
import type { BpmDelta } from './suggest'
import type { RelationId, Track } from './types'

/** Set boyunca tempo eğrisinin şekli. */
export type EnergyShape = 'rise' | 'arc' | 'flat' | 'descend'

export interface ShapeInfo {
  id: EnergyShape
  label: string
  hint: string
}

export const SHAPES: ShapeInfo[] = [
  { id: 'rise', label: 'Yükselen', hint: 'Baştan sona doğrusal hızlanma — warm-up setleri için.' },
  { id: 'arc', label: 'Kemer', hint: '%70’te tepe, sonra kısmi iniş — klasik gece seti.' },
  { id: 'flat', label: 'Düz', hint: 'Sabit tempo — tek bir bandı derinleştirir.' },
  { id: 'descend', label: 'İnen', hint: 'Doğrusal yavaşlama — kapanış ve after setleri.' },
]

/** Süresi bilinmeyen parça için varsayım: kulüpte bir parça aşağı yukarı 6 dakika. */
export const ASSUMED_SECONDS = 360

/** Ardışık aynı sanatçıya düşen ceza. */
const ARTIST_PENALTY = 40
/** Üst üste üçüncü kez aynı key'e düşen ceza. */
const KEY_REPEAT_PENALTY = 25

const RELATION_WEIGHT = 0.55
const CURVE_WEIGHT = 0.45

/** Çok uzun süre isteyen girdilerde döngü sonsuza gitmesin. */
const MAX_STEPS = 200

export interface BuildOptions {
  seed: Track
  pool: Track[]
  /** Parça sayısı hedefi. `minutes` ile birlikte verilirse bu kazanır. */
  count?: number
  /** Dakika hedefi. */
  minutes?: number
  tolerance: number
  relations: RelationId[]
  shape: EnergyShape
  /** Set boyunca hedeflenen toplam BPM değişimi. */
  bpmSpan: number
  /** Aynı sanatçının tekrar edebilmesi için gereken en az parça aralığı. */
  artistGap?: number
  beamWidth?: number
  exclude?: Set<string>
}

export interface BuildStep {
  track: Track
  /** Bir önceki parçadan bu parçaya geçişin ilişkisi; başlangıç parçasında `null`. */
  relation: RelationId | null
  delta: BpmDelta | null
  /** Eğrinin bu sırada beklediği tempo. */
  targetBpm: number
}

export interface BuildResult {
  steps: BuildStep[]
  /** Havuz yetmediyse ne yapılacağını söyleyen metin, yettiyse `null`. */
  shortfall: string | null
  /** Hedeflenen parça sayısı. */
  requested: number
  totalSeconds: number
}

/**
 * Eğrinin `i`. sıradaki hedef temposu.
 * `arc` şeklinde tepe %70'te: gecenin tepesi sonda değil, sondan biraz önce olur;
 * kalan %30'da sadece yarım span geri iner, set tamamen sönmez.
 */
export function targetBpm(
  shape: EnergyShape,
  start: number,
  span: number,
  i: number,
  n: number,
): number {
  if (n <= 1) return start
  const p = i / (n - 1)
  switch (shape) {
    case 'flat':
      return start
    case 'rise':
      return start + span * p
    case 'descend':
      return start - span * p
    case 'arc':
      return p <= 0.7 ? start + span * (p / 0.7) : start + span * (1 - 0.5 * ((p - 0.7) / 0.3))
  }
}

function seconds(track: Track): number {
  return track.duration ?? ASSUMED_SECONDS
}

function artistOf(track: Track): string {
  return track.artist.trim().toLowerCase()
}

interface BeamState {
  steps: BuildStep[]
  usedIds: Set<string>
  usedKeys: Set<string>
  totalSeconds: number
  score: number
}

interface Candidate {
  track: Track
  relation: RelationId
  delta: BpmDelta
  score: number
}

/**
 * Adayın bu adımdaki puanı: ilişki × 0.55 + eğriye uyum × 0.45, eksi cezalar.
 * Eğriye uyum, hedef tempodan sapmanın tolerans penceresine oranı.
 */
function stepScore(
  state: BeamState,
  cand: Track,
  id: RelationId,
  delta: BpmDelta,
  target: number,
  tolerance: number,
  artistGap: number,
): number {
  const info = relationInfo(id)
  if (!info) return 0

  const window = Math.max(1, (target * tolerance) / 100)
  const curve = 100 * Math.max(0, 1 - Math.abs(delta.matched - target) / window)
  let score = info.score * RELATION_WEIGHT + curve * CURVE_WEIGHT

  const recent = state.steps.slice(-artistGap)
  if (recent.some((step) => artistOf(step.track) === artistOf(cand))) score -= ARTIST_PENALTY

  // Üst üste üçüncü kez aynı key: harmonik olarak kusursuz ama set tekdüzeleşiyor.
  const lastTwo = state.steps.slice(-2)
  if (lastTwo.length === 2 && lastTwo.every((step) => step.track.key === cand.key)) {
    score -= KEY_REPEAT_PENALTY
  }

  return score
}

function compareCandidates(a: Candidate, b: Candidate): number {
  if (b.score !== a.score) return b.score - a.score
  if (a.delta.abs !== b.delta.abs) return a.delta.abs - b.delta.abs
  return a.track.id.localeCompare(b.track.id)
}

/**
 * Başlangıç parçasından başlayarak set kurar.
 * Aynı girdi her zaman aynı seti verir: sıralamalarda beraberlik parça kimliğiyle bozulur.
 */
export function buildSet(opts: BuildOptions): BuildResult {
  const artistGap = opts.artistGap ?? 3
  const beamWidth = Math.max(1, opts.beamWidth ?? 8)
  const exclude = opts.exclude ?? new Set<string>()
  const seedKey = trackKey(opts.seed)

  const usable = opts.pool.filter(
    (track) =>
      track.bpm !== null &&
      track.key !== null &&
      track.id !== opts.seed.id &&
      trackKey(track) !== seedKey &&
      !exclude.has(track.id) &&
      !exclude.has(trackKey(track)),
  )

  const start = opts.seed.bpm ?? 0
  const targetSeconds = opts.minutes ? opts.minutes * 60 : 0

  // Eğrinin uzunluğu baştan bilinmeli; dakika hedefinde ortalama parça süresinden tahmin edilir.
  const averageSeconds =
    usable.length > 0
      ? usable.reduce((total, track) => total + seconds(track), 0) / usable.length
      : ASSUMED_SECONDS
  const requested = opts.count
    ? Math.max(1, Math.round(opts.count))
    : opts.minutes
      ? Math.max(2, Math.round(targetSeconds / averageSeconds))
      : 1

  const first: BuildStep = {
    track: opts.seed,
    relation: null,
    delta: null,
    targetBpm: targetBpm(opts.shape, start, opts.bpmSpan, 0, requested),
  }

  let beam: BeamState[] = [
    {
      steps: [first],
      usedIds: new Set([opts.seed.id]),
      usedKeys: new Set([seedKey]),
      totalSeconds: seconds(opts.seed),
      score: 0,
    },
  ]
  const finished: BeamState[] = []

  const isComplete = (state: BeamState): boolean =>
    opts.count ? state.steps.length >= requested : state.totalSeconds >= targetSeconds

  if (opts.seed.bpm === null || opts.seed.key === null) {
    return {
      steps: [first],
      shortfall:
        'Başlangıç parçasının tempo ya da key bilgisi yok. Parçayı rekordbox’ta analiz et ya da başka bir parçayla başla.',
      requested,
      totalSeconds: seconds(opts.seed),
    }
  }

  for (let depth = 1; depth < MAX_STEPS; depth += 1) {
    if (beam.length === 0) break
    // Hepsi hedefe ulaştıysa ışını olduğu gibi bırak; aşağıdaki son toplama alacak.
    if (beam.every(isComplete)) break

    const next: BeamState[] = []
    for (const state of beam) {
      if (isComplete(state)) {
        finished.push(state)
        continue
      }

      const last = state.steps[state.steps.length - 1].track
      const target = targetBpm(opts.shape, start, opts.bpmSpan, state.steps.length, requested)
      const limit = ((last.bpm ?? start) * opts.tolerance) / 100

      const candidates: Candidate[] = []
      for (const cand of usable) {
        if (state.usedIds.has(cand.id)) continue
        const key = trackKey(cand)
        if (state.usedKeys.has(key)) continue

        const id = relation(last.key, cand.key)
        if (!id || !opts.relations.includes(id)) continue

        const delta = bpmDelta(last.bpm ?? start, cand.bpm ?? start)
        if (delta.abs > limit) continue

        candidates.push({
          track: cand,
          relation: id,
          delta,
          score: stepScore(state, cand, id, delta, target, opts.tolerance, artistGap),
        })
      }

      if (candidates.length === 0) {
        finished.push(state)
        continue
      }

      // Ardışık aynı sanatçı yasak; ama başka aday kalmadıysa sete devam etmek daha iyi.
      const withoutRepeat = candidates.filter((item) => artistOf(item.track) !== artistOf(last))
      const usableCandidates = withoutRepeat.length > 0 ? withoutRepeat : candidates

      usableCandidates.sort(compareCandidates)
      for (const candidate of usableCandidates.slice(0, beamWidth)) {
        next.push({
          steps: [
            ...state.steps,
            {
              track: candidate.track,
              relation: candidate.relation,
              delta: candidate.delta,
              targetBpm: target,
            },
          ],
          usedIds: new Set(state.usedIds).add(candidate.track.id),
          usedKeys: new Set(state.usedKeys).add(trackKey(candidate.track)),
          totalSeconds: state.totalSeconds + seconds(candidate.track),
          score: state.score + candidate.score,
        })
      }
    }

    next.sort((a, b) => {
      if (b.steps.length !== a.steps.length) return b.steps.length - a.steps.length
      if (b.score !== a.score) return b.score - a.score
      return a.steps[a.steps.length - 1].track.id.localeCompare(b.steps[b.steps.length - 1].track.id)
    })
    beam = next.slice(0, beamWidth)
  }

  finished.push(...beam)

  // En uzun set kazanır; eşitlikte toplam puan, sonra son parçanın kimliği (kararlılık için).
  finished.sort((a, b) => {
    if (b.steps.length !== a.steps.length) return b.steps.length - a.steps.length
    if (b.score !== a.score) return b.score - a.score
    return a.steps[a.steps.length - 1].track.id.localeCompare(b.steps[b.steps.length - 1].track.id)
  })

  const best = finished[0]
  const short = opts.count
    ? best.steps.length < requested
    : best.totalSeconds < targetSeconds - ASSUMED_SECONDS / 2

  return {
    steps: best.steps,
    shortfall: short
      ? `Havuzda yetecek kadar uyumlu parça yok: ${best.steps.length}/${requested} parça kuruldu. Toleransı %${opts.tolerance}’ten yukarı çek, kapalı ilişkileri aç ya da havuzu genişlet (başka bir playlist seç veya keşif katalogunu kullan).`
      : null,
    requested,
    totalSeconds: best.totalSeconds,
  }
}
