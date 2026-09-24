import { describe, expect, it } from 'vitest'
import { ALL_KEYS, relation } from './camelot'
import { bpmDelta } from './suggest'
import { buildEnergyScale, buildRatingIndex, trackEnergy } from './energy'
import type { RatingIndex } from './energy'
import { ASSUMED_SECONDS, buildSet, targetBpm, targetEnergy } from './setbuilder'
import type { BuildOptions, BuildResult } from './setbuilder'
import type { RelationId, Track } from './types'

const RELATIONS_ON: RelationId[] = ['same', 'up', 'down', 'relative', 'boost']

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
    expect(result.shortfall).toMatch(/1\/6 built/)
    expect(result.shortfall).toMatch(/Raise the tolerance/)
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
    expect(result.shortfall).toMatch(/Analyse it in rekordbox/)
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

const scale = buildEnergyScale(pool)
const NO_RATINGS: RatingIndex = new Map()

/** Ratings keyed the way the app keys them: from one set holding every rated track. */
function ratingsFor(rated: { track: Track; energy: number }[]): RatingIndex {
  const byId = new Map(rated.map((item) => [item.track.id, item.track]))
  return buildRatingIndex(
    [
      {
        id: 'rated',
        name: 'rated',
        createdAt: 0,
        entries: rated.map((item) => ({ trackId: item.track.id, energy: item.energy })),
      },
    ],
    (id) => byId.get(id) ?? null,
  )
}

function levels(result: BuildResult, ratings: RatingIndex = NO_RATINGS): number[] {
  return result.steps.map((step) => trackEnergy(scale, ratings, step.track)?.level ?? 0)
}

describe('targetEnergy', () => {
  it('rise başlangıçtan en üst seviyeye doğrusal yükselir', () => {
    expect(targetEnergy('rise', 2, 0, 4)).toBe(2)
    expect(targetEnergy('rise', 2, 3, 4)).toBe(5)
    expect(targetEnergy('rise', 2, 1, 4)).toBe(3)
  })

  it('descend en alt seviyeye iner', () => {
    expect(targetEnergy('descend', 4, 3, 4)).toBe(1)
  })

  it('flat başlangıç seviyesinde kalır', () => {
    expect(targetEnergy('flat', 3, 5, 9)).toBe(3)
  })

  it('arc yüzde 70 noktasında tepeye çıkar ve yarı yola geri iner', () => {
    expect(targetEnergy('arc', 1, 7, 11)).toBeCloseTo(5, 5)
    expect(targetEnergy('arc', 1, 10, 11)).toBeCloseTo(3, 5)
  })

  it('en üstten başlayan rise yerinde kalır, ölçeği aşmaz', () => {
    for (let i = 0; i < 6; i += 1) expect(targetEnergy('rise', 5, i, 6)).toBe(5)
  })

  it('tek parçalık sette başlangıç seviyesini verir', () => {
    expect(targetEnergy('arc', 2, 0, 1)).toBe(2)
  })
})

describe('buildSet — enerji hedefi', () => {
  const energy = { scale, ratings: NO_RATINGS }

  it('enerji verilmezse adımlarda enerji hedefi yok', () => {
    const result = buildSet(options({ count: 4 }))
    for (const step of result.steps) {
      expect(step.targetEnergy).toBeNull()
      expect(step.energy).toBeNull()
    }
  })

  it('her adıma şeklin enerji hedefini ve parçanın enerjisini yazar', () => {
    const result = buildSet(options({ count: 6, shape: 'rise', bpmSpan: 12, energy }))
    const start = result.steps[0].energy?.level ?? 0
    result.steps.forEach((step, i) => {
      expect(step.targetEnergy).toBeCloseTo(targetEnergy('rise', start, i, 6), 5)
      expect(step.energy).toEqual(trackEnergy(scale, NO_RATINGS, step.track))
    })
  })

  it('rise şeklinde enerji hiçbir adımda düşmez', () => {
    for (const bpmSpan of [0, 8, 12]) {
      const result = buildSet(options({ count: 10, shape: 'rise', bpmSpan, energy }))
      const found = levels(result)
      for (let i = 1; i < found.length; i += 1) {
        expect(found[i], `span ${bpmSpan}, step ${i}`).toBeGreaterThanOrEqual(found[i - 1])
      }
    }
  })

  it('tempo eğrisine daha yakın olsa da enerjisi düşen parçayı rise şeklinde seçmez', () => {
    const near: Track = { ...seed, id: 'near', title: 'Yakın', artist: 'Bir', bpm: 126 }
    const steady: Track = { ...seed, id: 'steady', title: 'Sabit', artist: 'İki', bpm: 120 }
    const ratings = ratingsFor([
      { track: seed, energy: 3 },
      { track: near, energy: 2 },
      { track: steady, energy: 3 },
    ])
    const build = { pool: [near, steady], count: 2, shape: 'rise' as const, bpmSpan: 12 }

    // Tempo alone takes the track sitting on the curve, even though the floor drops.
    expect(buildSet(options(build)).steps[1].track.id).toBe('near')
    const result = buildSet(options({ ...build, energy: { scale, ratings } }))
    expect(result.steps[1].track.id).toBe('steady')
  })

  it('yön bozmayan aday yoksa enerjisi düşeni de alıp seti sürdürür', () => {
    const lower: Track = { ...seed, id: 'lower', title: 'Alçak', artist: 'Bir', bpm: 124 }
    const ratings = ratingsFor([
      { track: seed, energy: 4 },
      { track: lower, energy: 2 },
    ])
    const result = buildSet(
      options({ pool: [lower], count: 2, shape: 'rise', bpmSpan: 12, energy: { scale, ratings } }),
    )
    expect(result.steps.map((step) => step.track.id)).toEqual(['seed', 'lower'])
    expect(result.shortfall).toBeNull()
  })

  it('rise şeklinde enerji gerçekten yükselir', () => {
    const result = buildSet(options({ count: 10, shape: 'rise', bpmSpan: 12, energy }))
    const found = levels(result)
    expect(found[found.length - 1]).toBeGreaterThan(found[0])
  })

  it('descend şeklinde enerji hiçbir adımda yükselmez', () => {
    const result = buildSet(
      options({ seed: { ...seed, bpm: 136 }, count: 8, shape: 'descend', bpmSpan: 12, energy }),
    )
    const found = levels(result)
    for (let i = 1; i < found.length; i += 1) {
      expect(found[i]).toBeLessThanOrEqual(found[i - 1])
    }
  })

  it('verilen puan, tahminin seçtirmeyeceği parçayı seçtirir', () => {
    // Two twins the builder cannot tell apart by key or tempo: only energy separates them.
    const twin = (id: string, artist: string): Track => ({
      id,
      title: `İkiz ${id}`,
      artist,
      bpm: 120,
      key: '8A',
      genre: 'Techno',
      duration: 360,
      source: 'catalog',
    })
    const a = twin('a1', 'Birinci')
    const b = twin('b1', 'İkinci')
    const small = options({ pool: [a, b], count: 2, energy })

    const estimated = buildSet(small)
    expect(estimated.steps[1].track.id).toBe('a1')

    const ratings = ratingsFor([
      { track: seed, energy: 5 },
      { track: a, energy: 1 },
      { track: b, energy: 5 },
    ])
    const rated = buildSet({ ...small, energy: { scale, ratings } })
    expect(rated.steps[1].track.id).toBe('b1')
    expect(rated.steps[1].energy).toEqual({ level: 5, rated: true })
  })

  it('başlangıç parçasının puanı enerji hedefinin başlangıcı olur', () => {
    const ratings = ratingsFor([{ track: seed, energy: 4 }])
    const result = buildSet(options({ count: 3, shape: 'flat', energy: { scale, ratings } }))
    expect(result.steps.map((step) => step.targetEnergy)).toEqual([4, 4, 4])
  })

  it('havuzda hiç puan yokken de istenen seti kurar', () => {
    for (const shape of ['rise', 'arc', 'flat', 'descend'] as const) {
      const result = buildSet(options({ count: 10, shape, bpmSpan: 8, energy }))
      expect(result.steps, shape).toHaveLength(10)
      expect(result.shortfall).toBeNull()
    }
  })

  it('enerji ölçeği boşken seti yine kurar, hedefi ortadan başlatır', () => {
    const empty = { scale: buildEnergyScale([]), ratings: NO_RATINGS }
    const result = buildSet(options({ count: 8, energy: empty }))
    expect(result.steps).toHaveLength(8)
    expect(result.steps[0].targetEnergy).toBe(3)
  })

  it('enerji eklenince tempo şekilleri bozulmaz', () => {
    const rise = buildSet(options({ count: 8, shape: 'rise', bpmSpan: 12, energy }))
    const riseBpms = rise.steps.map((step) => step.track.bpm!)
    expect(riseBpms[riseBpms.length - 1]).toBeGreaterThanOrEqual(riseBpms[0] + 8)

    const descend = buildSet(
      options({ seed: { ...seed, bpm: 136 }, count: 8, shape: 'descend', bpmSpan: 12, energy }),
    )
    const descendBpms = descend.steps.map((step) => step.track.bpm!)
    expect(descendBpms[descendBpms.length - 1]).toBeLessThanOrEqual(descendBpms[0] - 8)

    const flat = buildSet(options({ count: 10, shape: 'flat', bpmSpan: 0, energy }))
    for (const step of flat.steps) expect(Math.abs(step.track.bpm! - 120)).toBeLessThanOrEqual(4)

    const arc = buildSet(options({ count: 12, shape: 'arc', bpmSpan: 12, energy }))
    const arcBpms = arc.steps.map((step) => step.track.bpm!)
    expect(Math.max(...arcBpms)).toBeGreaterThanOrEqual(arcBpms[0] + 8)
  })

  it('enerji varken de geçişler tolerans ve izinli ilişkiler içinde kalır', () => {
    const result = buildSet(options({ count: 10, shape: 'arc', bpmSpan: 12, energy }))
    for (let i = 1; i < result.steps.length; i += 1) {
      const previous = result.steps[i - 1].track
      const current = result.steps[i].track
      expect(RELATIONS_ON).toContain(relation(previous.key, current.key))
      expect(bpmDelta(previous.bpm!, current.bpm!).abs).toBeLessThanOrEqual(
        (previous.bpm! * 6) / 100,
      )
    }
  })

  it('aynı girdi ve puanlarla aynı seti verir', () => {
    const ratings = ratingsFor([
      { track: pool[3], energy: 5 },
      { track: pool[40], energy: 1 },
    ])
    const build = () =>
      buildSet(options({ count: 10, shape: 'arc', bpmSpan: 12, energy: { scale, ratings } }))
    const once = build()
    expect(build().steps.map((step) => step.track.id)).toEqual(
      once.steps.map((step) => step.track.id),
    )
  })
})
