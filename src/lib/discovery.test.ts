import { describe, expect, it } from 'vitest'
import { CATALOG_CAP, mergeCatalog, usableTracks, validateDiscovery } from './discovery'
import type { Track } from './types'

function track(partial: Partial<Track> & { id: string }): Track {
  return {
    title: `Parça ${partial.id}`,
    artist: `Sanatçı ${partial.id}`,
    bpm: 124,
    key: '8A',
    source: 'catalog',
    ...partial,
  }
}

function many(count: number, from = 0): Track[] {
  return Array.from({ length: count }, (_, index) => track({ id: `t${from + index}` }))
}

describe('usableTracks', () => {
  it('temposu ya da keyi olmayanı eler', () => {
    const list = [
      track({ id: '1' }),
      track({ id: '2', bpm: null }),
      track({ id: '3', key: null }),
      track({ id: '4', bpm: 0 }),
    ]
    expect(usableTracks(list).map((item) => item.id)).toEqual(['1'])
  })

  it('boş listede boş döner', () => {
    expect(usableTracks([])).toEqual([])
  })
})

describe('validateDiscovery', () => {
  it('sağlam bir çekimi geçirir', () => {
    const result = validateDiscovery(many(20))
    expect(result.ok).toBe(true)
    expect(result.reasons).toEqual([])
    expect(result.stats).toMatchObject({ incoming: 20, usable: 20, keyRate: 1, bpmRate: 1 })
  })

  it('kullanılabilir parça azsa reddeder', () => {
    const result = validateDiscovery(many(5))
    expect(result.ok).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/at least 10 expected/)
  })

  it('eşleşme oranı düşükse reddeder', () => {
    const list = [...many(10), ...many(30, 100).map((item) => ({ ...item, key: null }))]
    const result = validateDiscovery(list)
    expect(result.ok).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/could be matched/)
  })

  it('tempolar aralık dışındaysa reddeder', () => {
    const result = validateDiscovery(many(20).map((item) => ({ ...item, bpm: 300 })))
    expect(result.ok).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/between 90 and 165/)
  })

  it('boş çekimde çökmez', () => {
    const result = validateDiscovery([])
    expect(result.ok).toBe(false)
    expect(result.stats).toMatchObject({ incoming: 0, usable: 0 })
  })
})

describe('mergeCatalog', () => {
  it('yeni parçaları başa koyar, eskileri korur', () => {
    const merged = mergeCatalog(many(3), [track({ id: 'yeni' })])
    expect(merged[0].id).toBe('yeni')
    expect(merged).toHaveLength(4)
  })

  it('aynı parçayı iki kez tutmaz', () => {
    const shared = track({ id: 'eski', title: 'Gece', artist: 'Ayla' })
    const sameAgain = track({ id: 'yeni-kimlik', title: 'Gece', artist: 'Ayla' })
    const merged = mergeCatalog([shared], [sameAgain])
    expect(merged).toHaveLength(1)
  })

  it('kullanılamaz yeni parçayı katalogda tutmaz', () => {
    const merged = mergeCatalog([], [track({ id: 'keysiz', key: null })])
    expect(merged).toEqual([])
  })

  it('eski katalogu asla küçültmez', () => {
    const previous = many(50)
    expect(mergeCatalog(previous, []).length).toBe(50)
  })

  it('üst sınırı aşmaz ve taşarken en yenileri tutar', () => {
    const merged = mergeCatalog(many(CATALOG_CAP, 1000), [track({ id: 'yeni' })])
    expect(merged).toHaveLength(CATALOG_CAP)
    expect(merged[0].id).toBe('yeni')
  })

  it('aynı girdi aynı çıktıyı verir', () => {
    const previous = many(4)
    const incoming = [track({ id: 'x' })]
    expect(mergeCatalog(previous, incoming)).toEqual(mergeCatalog(previous, incoming))
  })
})
