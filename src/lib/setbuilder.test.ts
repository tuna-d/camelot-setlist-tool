import { describe, expect, it } from 'vitest'
import { ALL_KEYS, relation } from './camelot'
import { bpmDelta } from './suggest'
import { ASSUMED_SECONDS, buildSet, targetBpm } from './setbuilder'
import type { BuildOptions } from './setbuilder'
import type { RelationId, Track } from './types'

const RELATIONS_ON: RelationId[] = ['same', 'up', 'down', 'relative', 'boost']

/** 24 key × 5 tempo × 7 sanatçı: gerçek bir kütüphane gibi çeşitli ama tahmin edilebilir. */
function makePool(): Track[] {
  const pool: Track[] = []
  let index = 0
  for (const key of ALL_KEYS) {
    for (const bpm of [120, 124, 128, 132, 136]) {
      index += 1
      pool.push({
        id: `t${String(index).padStart(3, '0')}`,
        title: `Parça ${index}`,
        artist: `Sanatçı ${index % 7}`,
        bpm,
        key,
        genre: 'Techno',
        duration: 360,
        source: 'catalog',
      })
    }
  }
  return pool
}

const pool = makePool()
const seed: Track = {
  id: 'seed',
  title: 'Başlangıç',
  artist: 'Açılış',
  bpm: 120,
  key: '8A',
  duration: 360,
  source: 'library',
}

function options(partial: Partial<BuildOptions> = {}): BuildOptions {
  return {
    seed,
    pool,
    count: 8,
    tolerance: 6,
    relations: RELATIONS_ON,
    shape: 'flat',
    bpmSpan: 0,
    ...partial,
  }
}

describe('targetBpm', () => {
  it('rise baştan sona doğrusal yükselir', () => {
    expect(targetBpm('rise', 120, 12, 0, 5)).toBe(120)
    expect(targetBpm('rise', 120, 12, 4, 5)).toBe(132)
    expect(targetBpm('rise', 120, 12, 2, 5)).toBe(126)
  })

  it('descend doğrusal iner', () => {
    expect(targetBpm('descend', 132, 12, 4, 5)).toBe(120)
  })

  it('flat sabit kalır', () => {
    expect(targetBpm('flat', 124, 12, 3, 5)).toBe(124)
  })

  it('arc %70’te tepe yapar ve yarım span geri iner', () => {
    const n = 11
    const peak = targetBpm('arc', 120, 10, 7, n)
    expect(peak).toBeCloseTo(130, 5)
    expect(targetBpm('arc', 120, 10, 10, n)).toBeCloseTo(125, 5)
    // Tepe gerçekten tepe: iki yanındaki değerler daha düşük.
    expect(targetBpm('arc', 120, 10, 6, n)).toBeLessThan(peak)
    expect(targetBpm('arc', 120, 10, 8, n)).toBeLessThan(peak)
  })

  it('tek parçalık sette başlangıç temposunu verir', () => {
    expect(targetBpm('rise', 124, 12, 0, 1)).toBe(124)
  })
})

describe('buildSet — geçiş kalitesi', () => {
  const result = buildSet(options({ count: 10 }))

  it('istenen sayıda parça kurar', () => {
    expect(result.steps).toHaveLength(10)
    expect(result.shortfall).toBeNull()
  })

  it('her geçiş izin verilen bir ilişki ve tolerans içinde', () => {
    for (let i = 1; i < result.steps.length; i += 1) {
      const previous = result.steps[i - 1].track
      const current = result.steps[i].track
      const id = relation(previous.key, current.key)
      expect(id, `${previous.key} → ${current.key}`).not.toBeNull()
      expect(RELATIONS_ON).toContain(id)
      expect(result.steps[i].relation).toBe(id)

      const delta = bpmDelta(previous.bpm!, current.bpm!)
      expect(delta.abs).toBeLessThanOrEqual((previous.bpm! * 6) / 100)
    }
  })

  it('aynı parça iki kez geçmez', () => {
    const ids = result.steps.map((step) => step.track.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('aynı sanatçı arka arkaya gelmez', () => {
    for (let i = 1; i < result.steps.length; i += 1) {
      expect(result.steps[i].track.artist).not.toBe(result.steps[i - 1].track.artist)
    }
  })

  it('ilk sıra her zaman başlangıç parçası', () => {
    expect(result.steps[0].track.id).toBe('seed')
    expect(result.steps[0].relation).toBeNull()
  })

  it('aynı girdi aynı seti verir', () => {
    const again = buildSet(options({ count: 10 }))
    expect(again.steps.map((step) => step.track.id)).toEqual(
      result.steps.map((step) => step.track.id),
    )
  })
})

describe('buildSet — enerji şekilleri', () => {
  it('rise gerçekten hızlanır', () => {
    const result = buildSet(options({ count: 8, shape: 'rise', bpmSpan: 12 }))
    const first = result.steps[0].track.bpm!
    const last = result.steps[result.steps.length - 1].track.bpm!
    expect(last).toBeGreaterThanOrEqual(first + 8)
  })

  it('descend gerçekten yavaşlar', () => {
    const result = buildSet(
      options({
        seed: { ...seed, bpm: 136 },
        count: 8,
        shape: 'descend',
        bpmSpan: 12,
      }),
    )
    const first = result.steps[0].track.bpm!
    const last = result.steps[result.steps.length - 1].track.bpm!
    expect(last).toBeLessThanOrEqual(first - 8)
  })

  it('flat dar bantta kalır', () => {
    const result = buildSet(options({ count: 10, shape: 'flat', bpmSpan: 0 }))
    for (const step of result.steps) {
      expect(Math.abs(step.track.bpm! - 120)).toBeLessThanOrEqual(4)
    }
  })

  it('arc önce hızlanır sonra kısmen iner', () => {
    const result = buildSet(options({ count: 12, shape: 'arc', bpmSpan: 12 }))
    const bpms = result.steps.map((step) => step.track.bpm!)
    const peak = Math.max(...bpms)
    expect(peak).toBeGreaterThanOrEqual(bpms[0] + 8)
    expect(bpms[bpms.length - 1]).toBeLessThanOrEqual(peak)
  })
})

describe('buildSet — süreye göre kurma', () => {
  it('dakika hedefini tutturur', () => {
    const result = buildSet(options({ count: undefined, minutes: 42, shape: 'flat' }))
    expect(result.totalSeconds).toBeGreaterThanOrEqual(42 * 60)
    expect(result.steps).toHaveLength(7)
    expect(result.shortfall).toBeNull()
  })

  it('süresi bilinmeyen parçaya 6 dakika sayar', () => {
    const noDuration = pool.map((track) => ({ ...track, duration: undefined }))
    const result = buildSet(
      options({ pool: noDuration, seed: { ...seed, duration: undefined }, count: undefined, minutes: 30 }),
    )
    expect(result.totalSeconds).toBe(result.steps.length * ASSUMED_SECONDS)
    expect(result.totalSeconds).toBeGreaterThanOrEqual(30 * 60)
  })
})

describe('buildSet — sınır durumları', () => {
  it('boş havuzda çökmez, ne yapılacağını söyler', () => {
    const result = buildSet(options({ pool: [], count: 6 }))
    expect(result.steps).toHaveLength(1)
    expect(result.shortfall).toMatch(/1\/6 parça kuruldu/)
    expect(result.shortfall).toMatch(/Toleransı/)
  })

  it('havuz yetmediğinde kurabildiği kadarını verir', () => {
    const tiny = pool.filter((track) => track.key === '8A' || track.key === '9A').slice(0, 3)
    const result = buildSet(options({ pool: tiny, count: 12 }))
    expect(result.steps.length).toBeLessThan(12)
    expect(result.shortfall).not.toBeNull()
  })

  it('başlangıç parçasının keyi yoksa açıklayıcı hata metni döner', () => {
    const result = buildSet(options({ seed: { ...seed, key: null } }))
    expect(result.steps).toHaveLength(1)
    expect(result.shortfall).toMatch(/analiz et/)
  })

  it('exclude kümesindeki parçalar sete girmez', () => {
    const banned = new Set(pool.slice(0, 40).map((track) => track.id))
    const result = buildSet(options({ count: 6, exclude: banned }))
    for (const step of result.steps.slice(1)) {
      expect(banned.has(step.track.id)).toBe(false)
    }
  })

  it('tek parçalık set istenebilir', () => {
    const result = buildSet(options({ count: 1 }))
    expect(result.steps).toHaveLength(1)
    expect(result.shortfall).toBeNull()
  })
})
