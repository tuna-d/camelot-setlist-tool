import { relation } from './camelot'
import { energyLevel } from './energy'
import { bpmDelta } from './suggest'
import type { BpmDelta } from './suggest'
import type { RelationId, Track } from './types'

export interface Transition {
  relation: RelationId | null
  delta: BpmDelta | null
  tempoOk: boolean
  /** Key and tempo only: an energy drop is a warning about the set's shape, not a bad mix. */
  ok: boolean
  /** True when the energy falls off a cliff; null when either side has no energy. */
  energyDrop: boolean | null
}

/** The levels each side displays, rated or estimated alike. */
export interface TransitionEnergy {
  from: number | null
  to: number | null
}

/** One level down is ordinary set shaping; two or more empties the floor. */
export const ENERGY_DROP_LEVELS = 2

export function energyDrop(from: number | null, to: number | null): boolean | null {
  const before = energyLevel(from)
  const after = energyLevel(to)
  if (before === null || after === null) return null
  return before - after >= ENERGY_DROP_LEVELS
}

/** One place for the transition verdict, so the list and the summary agree. */
export function transition(
  from: Track,
  to: Track,
  tolerance: number,
  energy?: TransitionEnergy,
): Transition {
  const id = relation(from.key, to.key)
  const delta = from.bpm !== null && to.bpm !== null ? bpmDelta(from.bpm, to.bpm) : null
  const limit = from.bpm !== null ? (from.bpm * tolerance) / 100 : 0
  const tempoOk = delta !== null && delta.abs <= limit
  return {
    relation: id,
    delta,
    tempoOk,
    ok: id !== null && tempoOk,
    energyDrop: energy ? energyDrop(energy.from, energy.to) : null,
  }
}

export interface SetStats {
  count: number
  seconds: number
  minBpm: number | null
  maxBpm: number | null
  /** Number of transitions that strain either the key or the tempo. */
  rough: number
  /** Number of transitions where the energy falls by two levels or more. */
  drops: number
  keys: number
}

const ASSUMED_DURATION = 360

/** `energy` runs alongside `tracks`: the level each one displays, or null. */
export function setStats(
  tracks: Track[],
  tolerance: number,
  energy: readonly (number | null)[] = [],
): SetStats {
  const bpms = tracks.map((track) => track.bpm).filter((bpm): bpm is number => bpm !== null)
  const keys = new Set(tracks.map((track) => track.key).filter((key): key is string => key !== null))

  let rough = 0
  let drops = 0
  for (let index = 1; index < tracks.length; index += 1) {
    const step = transition(tracks[index - 1], tracks[index], tolerance, {
      from: energy[index - 1] ?? null,
      to: energy[index] ?? null,
    })
    if (!step.ok) rough += 1
    if (step.energyDrop) drops += 1
  }

  return {
    count: tracks.length,
    seconds: tracks.reduce((total, track) => total + (track.duration ?? ASSUMED_DURATION), 0),
    minBpm: bpms.length > 0 ? Math.min(...bpms) : null,
    maxBpm: bpms.length > 0 ? Math.max(...bpms) : null,
    rough,
    drops,
    keys: keys.size,
  }
}
