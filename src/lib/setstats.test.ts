import { describe, expect, it } from 'vitest'
import { setStats, transition } from './setstats'
import type { Track } from './types'

function track(partial: Partial<Track> & { id: string }): Track {
  return {
    title: `Parça ${partial.id}`,
    artist: 'Sanatçı',
    bpm: 124,
    key: '8A',
    source: 'library',
    ...partial,
  }
}

describe('transition', () => {
  it('aynı key ve yakın tempoda geçiş uygun', () => {
    const result = transition(track({ id: '1', bpm: 124 }), track({ id: '2', bpm: 126 }), 6)
    expect(result.relation).toBe('same')
    expect(result.ok).toBe(true)
  })

  it('tanımsız ilişkide geçiş uygun değil', () => {
    const result = transition(
      track({ id: '1', key: '8A' }),
      track({ id: '2', key: '12A' }),
      6,
    )
    expect(result.relation).toBeNull()
    expect(result.ok).toBe(false)
  })

  it('tolerans dışındaki tempo ilişkiyi kurtarmaz', () => {
    const result = transition(
      track({ id: '1', bpm: 120 }),
      track({ id: '2', bpm: 140 }),
      6,
    )
    expect(result.relation).toBe('same')
    expect(result.tempoOk).toBe(false)
    expect(result.ok).toBe(false)
  })

  it('tempo bilinmiyorsa geçişe güvenmez', () => {
    const result = transition(track({ id: '1', bpm: null }), track({ id: '2' }), 6)
    expect(result.delta).toBeNull()
    expect(result.ok).toBe(false)
  })

  it('tolerans sınırındaki fark hâlâ uygun', () => {
    // %6 tolerans, 100 BPM → sınır tam 6 BPM.
    expect(transition(track({ id: '1', bpm: 100 }), track({ id: '2', bpm: 106 }), 6).ok).toBe(true)
    expect(transition(track({ id: '1', bpm: 100 }), track({ id: '2', bpm: 106.1 }), 6).ok).toBe(false)
  })
})

describe('setStats', () => {
  it('boş sette sıfırları döner', () => {
    expect(setStats([], 6)).toEqual({
      count: 0,
      seconds: 0,
      minBpm: null,
      maxBpm: null,
      rough: 0,
      keys: 0,
    })
  })

  it('süre, tempo aralığı ve key sayısını çıkarır', () => {
    const stats = setStats(
      [
        track({ id: '1', bpm: 120, key: '8A', duration: 300 }),
        track({ id: '2', bpm: 124, key: '9A', duration: 300 }),
      ],
      6,
    )
    expect(stats.count).toBe(2)
    expect(stats.seconds).toBe(600)
    expect(stats.minBpm).toBe(120)
    expect(stats.maxBpm).toBe(124)
    expect(stats.keys).toBe(2)
  })

  it('süresi bilinmeyen parça için varsayılan uzunluk sayar', () => {
    expect(setStats([track({ id: '1', duration: undefined })], 6).seconds).toBe(360)
  })

  it('zorlayan geçişleri sayar', () => {
    const stats = setStats(
      [
        track({ id: '1', key: '8A', bpm: 120 }),
        track({ id: '2', key: '9A', bpm: 122 }),
        track({ id: '3', key: '12A', bpm: 122 }),
      ],
      6,
    )
    expect(stats.rough).toBe(1)
  })

  it('tek parçada geçiş yok', () => {
    expect(setStats([track({ id: '1' })], 6).rough).toBe(0)
  })

  it('keysiz parçalar key sayısına girmez', () => {
    expect(setStats([track({ id: '1', key: null }), track({ id: '2', key: null })], 6).keys).toBe(0)
  })

  it('aynı girdi aynı çıktıyı verir', () => {
    const tracks = [track({ id: '1', bpm: 120 }), track({ id: '2', bpm: 124, key: '9A' })]
    expect(setStats(tracks, 6)).toEqual(setStats(tracks, 6))
  })
})
