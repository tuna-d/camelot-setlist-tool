import { relation, relationInfo } from './camelot'
import { ENERGY_LEVELS, trackEnergy } from './energy'
import type { EnergyScale, EntryEnergy, RatingIndex } from './energy'
import { bpmDelta, trackKey } from './suggest'
import type { BpmDelta } from './suggest'
import type { RelationId, Track } from './types'

export type EnergyShape = 'rise' | 'arc' | 'flat' | 'descend'

export interface ShapeInfo {
  id: EnergyShape
  label: string
  hint: string
}

export const SHAPES: ShapeInfo[] = [
  { id: 'rise', label: 'Rising', hint: 'Linear speed-up from start to finish — for warm-up sets.' },
  { id: 'arc', label: 'Arc', hint: 'Peak at 70%, then a partial descent — the classic night set.' },
  { id: 'flat', label: 'Flat', hint: 'Steady tempo — digs into a single band.' },
  { id: 'descend', label: 'Descending', hint: 'Linear slow-down — closing and after sets.' },
]

export const ASSUMED_SECONDS = 360

const ARTIST_PENALTY = 40
const KEY_REPEAT_PENALTY = 25

const RELATION_WEIGHT = 0.55
const CURVE_WEIGHT = 0.45
// Added on top of the tempo score rather than carved out of it, so a build without
// energy scores exactly as it always has.
const ENERGY_WEIGHT = 0.35
/** Levels off target at which a candidate earns no energy credit at all. */
const ENERGY_WINDOW = 2
/** Where the energy target starts when the seed has neither a rating nor an estimate. */
const MIDDLE_ENERGY = 3

const MAX_STEPS = 200

export interface BuildOptions {
  seed: Track
  pool: Track[]
  count?: number
  minutes?: number
  tolerance: number
  relations: RelationId[]
  shape: EnergyShape
  bpmSpan: number
  artistGap?: number
  beamWidth?: number
  exclude?: Set<string>
  /** Scores candidates against an energy target too; tempo alone when absent. */
  energy?: BuildEnergy
}

export interface BuildEnergy {
  scale: EnergyScale
  ratings: RatingIndex
}

export interface BuildStep {
  track: Track
  relation: RelationId | null
  delta: BpmDelta | null
  targetBpm: number
  /** Null when the build ran without energy. */
  targetEnergy: number | null
  energy: EntryEnergy | null
}

export interface BuildResult {
  steps: BuildStep[]
  shortfall: string | null
  requested: number
  totalSeconds: number
}

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

/**
 * The same curve as the tempo, drawn on the 1-5 scale: a rise climbs to the top, a
 * descent falls to the bottom, and an arc peaks at the top.
 */
export function targetEnergy(shape: EnergyShape, start: number, i: number, n: number): number {
  const span = shape === 'descend' ? start - 1 : ENERGY_LEVELS - start
  return targetBpm(shape, start, span, i, n)
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
  energy: EntryEnergy | null
  score: number
}

function stepScore(
  state: BeamState,
  cand: Track,
  id: RelationId,
  delta: BpmDelta,
  target: number,
  tolerance: number,
  artistGap: number,
  energy: EntryEnergy | null,
  energyTarget: number | null,
): number {
  const info = relationInfo(id)
  if (!info) return 0

  const window = Math.max(1, (target * tolerance) / 100)
  const curve = 100 * Math.max(0, 1 - Math.abs(delta.matched - target) / window)
  let score = info.score * RELATION_WEIGHT + curve * CURVE_WEIGHT
  if (energy !== null && energyTarget !== null) {
    const fit = 100 * Math.max(0, 1 - Math.abs(energy.level - energyTarget) / ENERGY_WINDOW)
    score += fit * ENERGY_WEIGHT
  }

  const recent = state.steps.slice(-artistGap)
  if (recent.some((step) => artistOf(step.track) === artistOf(cand))) score -= ARTIST_PENALTY

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

  const averageSeconds =
    usable.length > 0
      ? usable.reduce((total, track) => total + seconds(track), 0) / usable.length
      : ASSUMED_SECONDS
  const requested = opts.count
    ? Math.max(1, Math.round(opts.count))
    : opts.minutes
      ? Math.max(2, Math.round(targetSeconds / averageSeconds))
      : 1

  const energyOf = (track: Track): EntryEnergy | null =>
    opts.energy ? trackEnergy(opts.energy.scale, opts.energy.ratings, track) : null
  const seedEnergy = energyOf(opts.seed)
  const startEnergy = seedEnergy?.level ?? MIDDLE_ENERGY
  const energyTargetAt = (i: number): number | null =>
    opts.energy ? targetEnergy(opts.shape, startEnergy, i, requested) : null

  const first: BuildStep = {
    track: opts.seed,
    relation: null,
    delta: null,
    targetBpm: targetBpm(opts.shape, start, opts.bpmSpan, 0, requested),
    targetEnergy: energyTargetAt(0),
    energy: seedEnergy,
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
        'The starting track has no tempo or key. Analyse it in rekordbox, or start from another track.',
      requested,
      totalSeconds: seconds(opts.seed),
    }
  }

  for (let depth = 1; depth < MAX_STEPS; depth += 1) {
    if (beam.length === 0) break
    if (beam.every(isComplete)) break

    const next: BeamState[] = []
    for (const state of beam) {
      if (isComplete(state)) {
        finished.push(state)
        continue
      }

      const lastStep = state.steps[state.steps.length - 1]
      const last = lastStep.track
      const target = targetBpm(opts.shape, start, opts.bpmSpan, state.steps.length, requested)
      const energyTarget = energyTargetAt(state.steps.length)
      const heading =
        energyTarget === null || lastStep.targetEnergy === null
          ? 0
          : Math.sign(energyTarget - lastStep.targetEnergy)
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

        const energy = energyOf(cand)
        candidates.push({
          track: cand,
          relation: id,
          delta,
          energy,
          score: stepScore(
            state,
            cand,
            id,
            delta,
            target,
            opts.tolerance,
            artistGap,
            energy,
            energyTarget,
          ),
        })
      }

      if (candidates.length === 0) {
        finished.push(state)
        continue
      }

      const withoutRepeat = candidates.filter((item) => artistOf(item.track) !== artistOf(last))
      const varied = withoutRepeat.length > 0 ? withoutRepeat : candidates
      // Closeness to the target alone lets a rise dip a level when that track sits
      // nearer the tempo curve; a floor that drops mid-climb is what the DJ notices,
      // so a step against the shape's direction is taken only when nothing else fits.
      const lastLevel = lastStep.energy?.level
      const onCourse =
        heading === 0 || lastLevel === undefined
          ? varied
          : varied.filter(
              (item) =>
                item.energy === null ||
                (heading > 0 ? item.energy.level >= lastLevel : item.energy.level <= lastLevel),
            )
      const usableCandidates = onCourse.length > 0 ? onCourse : varied

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
              targetEnergy: energyTarget,
              energy: candidate.energy,
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
      ? `The pool has too few compatible tracks: ${best.steps.length}/${requested} built. Raise the tolerance above ${opts.tolerance}%, turn on the relations you disabled, or widen the pool (pick another playlist or use the discovery catalog).`
      : null,
    requested,
    totalSeconds: best.totalSeconds,
  }
}
