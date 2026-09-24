import { describe, expect, it } from 'vitest'
import { energyDrop, setStats, transition } from './setstats'
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

describe('energyDrop', () => {
  it('iki seviyelik düşüşü yakalar', () => {
    expect(energyDrop(4, 2)).toBe(true)
    expect(energyDrop(5, 1)).toBe(true)
  })

  it('bir seviyelik düşüşü yakalamaz', () => {
    expect(energyDrop(4, 3)).toBe(false)
  })

  it('yükselişi ve aynı seviyeyi asla yakalamaz', () => {
    expect(energyDrop(1, 5)).toBe(false)
    expect(energyDrop(3, 3)).toBe(false)
  })

  it('bir tarafta enerji yoksa hüküm vermez', () => {
    expect(energyDrop(null, 2)).toBeNull()
    expect(energyDrop(4, null)).toBeNull()
    expect(energyDrop(null, null)).toBeNull()
  })

  it('1-5 dışındaki ya da kesirli seviyeyi enerji saymaz', () => {
    expect(energyDrop(7, 2)).toBeNull()
    expect(energyDrop(4, 0)).toBeNull()
    expect(energyDrop(4.5, 2)).toBeNull()
    expect(energyDrop(Number.NaN, 2)).toBeNull()
  })
})

describe('transition enerji', () => {
  it('enerji verilince düşüş hükmünü taşır, key ve tempo hükmünü değiştirmez', () => {
    const result = transition(track({ id: '1' }), track({ id: '2' }), 6, { from: 5, to: 2 })
    expect(result.energyDrop).toBe(true)
    expect(result.ok).toBe(true)
  })

  it('enerji verilmezse düşüş hükmü yok', () => {
    expect(transition(track({ id: '1' }), track({ id: '2' }), 6).energyDrop).toBeNull()
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
      drops: 0,
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

  it('enerji düşüşlerini zorlayan geçişlerden ayrı sayar', () => {
    const tracks = [
      track({ id: '1' }),
      track({ id: '2' }),
      track({ id: '3' }),
      track({ id: '4' }),
      track({ id: '5' }),
    ]
    // 5→3 düşüş, 3→2 değil, 2→null hükümsüz, null→1 hükümsüz.
    const stats = setStats(tracks, 6, [5, 3, 2, null, 1])
    expect(stats.drops).toBe(1)
    expect(stats.rough).toBe(0)
  })

  it('enerji listesi yoksa ya da kısaysa düşüş saymaz', () => {
    const tracks = [track({ id: '1' }), track({ id: '2' }), track({ id: '3' })]
    expect(setStats(tracks, 6).drops).toBe(0)
    expect(setStats(tracks, 6, [5]).drops).toBe(0)
  })

  it('tek parçada geçiş yok', () => {
    expect(setStats([track({ id: '1' })], 6).rough).toBe(0)
  })

  it('keysiz parçalar key sayısına girmez', () => {
    expect(setStats([track({ id: '1', key: null }), track({ id: '2', key: null })], 6).keys).toBe(0)
  })

  it('aynı girdi aynı çıktıyı verir', () => {
    const tracks = [track({ id: '1', bpm: 120 }), track({ id: '2', bpm: 124, key: '9A' })]
    expect(setStats(tracks, 6, [5, 2])).toEqual(setStats(tracks, 6, [5, 2]))
  })
})
