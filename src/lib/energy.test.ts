import { describe, expect, it } from 'vitest'
import {
  ENERGY_LEVELS,
  MIN_GENRE_TRACKS,
  buildEnergyScale,
  energyLevel,
  entryEnergy,
  estimateEnergy,
} from './energy'
import type { Track } from './types'

let counter = 0

function track(partial: Partial<Track> = {}): Track {
  counter += 1
  return {
    id: `t${counter}`,
    title: `Parça ${counter}`,
    artist: 'Sanatçı',
    bpm: 124,
    key: '8A',
    source: 'catalog',
    ...partial,
  }
}

/** `count` tracks of one genre, tempos spread evenly from `low` to `high`. */
function genre(name: string, count: number, low: number, high: number): Track[] {
  return Array.from({ length: count }, (_, i) =>
    track({ genre: name, bpm: low + ((high - low) * i) / (count - 1) }),
  )
}

const afro = genre('Afro House', 30, 118, 124)
const techno = genre('Techno', 30, 130, 145)
const pool = [...afro, ...techno]
const scale = buildEnergyScale(pool)

function estimate(partial: Partial<Track>): number | null {
  return estimateEnergy(scale, track(partial))
}

describe('estimateEnergy', () => {
  it('aynı tür içinde tempo arttıkça tahmin düşmez', () => {
    const levels = [118, 119, 120, 121, 122, 123, 124].map((bpm) =>
      estimate({ genre: 'Afro House', bpm }),
    )
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1] as number)
    }
    expect(levels[0]).toBe(1)
    expect(levels[levels.length - 1]).toBe(5)
  })

  it('kendi türünde yüksek olan tempo, türü ne olursa olsun yüksek okunur', () => {
    expect(estimate({ genre: 'Afro House', bpm: 124 })).toBe(5)
    expect(estimate({ genre: 'Techno', bpm: 145 })).toBe(5)
  })

  it('aynı tempo iki türde farklı okunur', () => {
    expect(estimate({ genre: 'Afro House', bpm: 124 })).toBe(5)
    expect(estimate({ genre: 'Techno', bpm: 124 })).toBe(1)
  })

  it('tür adını büyük/küçük harf ve boşluktan bağımsız eşler', () => {
    expect(estimate({ genre: '  techno ', bpm: 145 })).toBe(estimate({ genre: 'Techno', bpm: 145 }))
  })

  it(`${MIN_GENRE_TRACKS} parçadan az tutan tür tüm havuzun dağılımına düşer`, () => {
    const small = genre('Melodic House', MIN_GENRE_TRACKS - 1, 100, 101)
    const withSmall = buildEnergyScale([...pool, ...small])
    // Within its own 19 tracks 101 would be the top; against the whole pool it is not.
    const level = estimateEnergy(withSmall, track({ genre: 'Melodic House', bpm: 101 }))
    const wholePool = estimateEnergy(withSmall, track({ bpm: 101 }))
    expect(level).toBe(wholePool)
    expect(level).toBeLessThan(5)
  })

  it(`tam ${MIN_GENRE_TRACKS} parçalık tür kendi dağılımını kullanır`, () => {
    const exact = genre('Melodic House', MIN_GENRE_TRACKS, 100, 101)
    const withExact = buildEnergyScale([...pool, ...exact])
    expect(estimateEnergy(withExact, track({ genre: 'Melodic House', bpm: 101 }))).toBe(5)
  })

  it('türü olmayan ya da havuzda bulunmayan tür tüm havuza göre ölçülür', () => {
    expect(estimate({ bpm: 145 })).toBe(5)
    expect(estimate({ genre: 'Bilinmeyen', bpm: 110 })).toBe(1)
  })

  it('majör key aynı tempodaki minörden yarım bant yukarı okunur', () => {
    // 121 sits in the middle of Afro House: half a band decides the level here.
    const minor = estimate({ genre: 'Afro House', bpm: 121, key: '8A' })
    const major = estimate({ genre: 'Afro House', bpm: 121, key: '8B' })
    expect(minor).toBe(3)
    expect(major).toBe(4)
  })

  it('majör itki 5 seviyesini aşmaz', () => {
    expect(estimate({ genre: 'Techno', bpm: 145, key: '8B' })).toBe(5)
  })

  it('key bilinmeyen parça minör gibi, itkisiz okunur', () => {
    const unknown = estimate({ genre: 'Afro House', bpm: 121, key: null })
    expect(unknown).toBe(estimate({ genre: 'Afro House', bpm: 121, key: '8A' }))
  })

  it('tempo yoksa tahmin yok', () => {
    expect(estimate({ bpm: null })).toBeNull()
    expect(estimate({ bpm: Number.NaN })).toBeNull()
    expect(estimate({ bpm: 0 })).toBeNull()
    expect(estimate({ bpm: -120 })).toBeNull()
  })

  it('boş havuzda tahmin yok', () => {
    expect(estimateEnergy(buildEnergyScale([]), track({ bpm: 124 }))).toBeNull()
  })

  it('bozuk havuz girdisinde çökmez', () => {
    const broken = [null, 42, { genre: 'Techno' }, track({ bpm: Number.POSITIVE_INFINITY })]
    const built = buildEnergyScale(broken as unknown as Track[])
    expect(estimateEnergy(built, track({ bpm: 124 }))).toBeNull()
    expect(buildEnergyScale(null as unknown as Track[])).toBeTruthy()
  })

  it('aynı girdiye her seferinde aynı tahmini verir', () => {
    const again = buildEnergyScale([...pool].reverse())
    for (const bpm of [118, 121, 124, 130, 137, 145]) {
      const probe = track({ genre: 'Techno', bpm, key: '8B' })
      const first = estimateEnergy(scale, probe)
      expect(estimateEnergy(scale, probe)).toBe(first)
      expect(estimateEnergy(again, probe)).toBe(first)
    }
  })
})

describe('entryEnergy', () => {
  it('puan verilmişse puanı döner, tahmini değil', () => {
    const probe = track({ genre: 'Techno', bpm: 145 })
    expect(entryEnergy(scale, { trackId: probe.id, energy: 2 }, probe)).toEqual({
      level: 2,
      rated: true,
    })
  })

  it('puan yoksa tahmini döner', () => {
    const probe = track({ genre: 'Techno', bpm: 145 })
    expect(entryEnergy(scale, { trackId: probe.id }, probe)).toEqual({ level: 5, rated: false })
  })

  it('tempo da puan da yoksa hiçbir şey dönmez', () => {
    const probe = track({ bpm: null })
    expect(entryEnergy(scale, { trackId: probe.id }, probe)).toBeNull()
  })

  it('tempo yokken bile verilen puanı gösterir', () => {
    const probe = track({ bpm: null })
    expect(entryEnergy(scale, { trackId: probe.id, energy: 4 }, probe)).toEqual({
      level: 4,
      rated: true,
    })
  })

  it('geçersiz puanı yok sayıp tahmine döner', () => {
    const probe = track({ genre: 'Techno', bpm: 145 })
    for (const bad of [0, 6, 2.5, Number.NaN, '3']) {
      const entry = { trackId: probe.id, energy: bad as number }
      expect(entryEnergy(scale, entry, probe)).toEqual({ level: 5, rated: false })
    }
  })

  it('giriş yoksa tahmine düşer', () => {
    const probe = track({ genre: 'Techno', bpm: 145 })
    expect(entryEnergy(scale, undefined, probe)).toEqual({ level: 5, rated: false })
  })
})

describe('energyLevel', () => {
  it('1-5 arası tam sayıyı olduğu gibi döner', () => {
    for (let level = 1; level <= ENERGY_LEVELS; level++) expect(energyLevel(level)).toBe(level)
  })

  it('ölçek dışını, kesirliyi ve sayı olmayanı reddeder', () => {
    for (const value of [0, 6, -1, 3.4, Number.NaN, Infinity, '3', null, undefined, {}]) {
      expect(energyLevel(value)).toBeNull()
    }
  })
})
