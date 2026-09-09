import { relation } from './camelot'
import { bpmDelta } from './suggest'
import type { BpmDelta } from './suggest'
import type { RelationId, Track } from './types'

export interface Transition {
  relation: RelationId | null
  delta: BpmDelta | null
  tempoOk: boolean
  ok: boolean
}

/** One place for the transition verdict, so the list and the summary agree. */
export function transition(from: Track, to: Track, tolerance: number): Transition {
  const id = relation(from.key, to.key)
  const delta = from.bpm !== null && to.bpm !== null ? bpmDelta(from.bpm, to.bpm) : null
  const limit = from.bpm !== null ? (from.bpm * tolerance) / 100 : 0
  const tempoOk = delta !== null && delta.abs <= limit
  return { relation: id, delta, tempoOk, ok: id !== null && tempoOk }
}

export interface SetStats {
  count: number
  seconds: number
  minBpm: number | null
  maxBpm: number | null
  /** Number of transitions that strain either the key or the tempo. */
  rough: number
  keys: number
}

const ASSUMED_DURATION = 360

export function setStats(tracks: Track[], tolerance: number): SetStats {
  const bpms = tracks.map((track) => track.bpm).filter((bpm): bpm is number => bpm !== null)
  const keys = new Set(tracks.map((track) => track.key).filter((key): key is string => key !== null))

  let rough = 0
  for (let index = 1; index < tracks.length; index += 1) {
    if (!transition(tracks[index - 1], tracks[index], tolerance).ok) rough += 1
  }

  return {
    count: tracks.length,
    seconds: tracks.reduce((total, track) => total + (track.duration ?? ASSUMED_DURATION), 0),
    minBpm: bpms.length > 0 ? Math.min(...bpms) : null,
    maxBpm: bpms.length > 0 ? Math.max(...bpms) : null,
    rough,
    keys: keys.size,
  }
}
