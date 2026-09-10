import { describe, expect, it } from 'vitest'
import { CATALOG_CAP, collectFromCharts, mergeCatalog, usableTracks, validateDiscovery } from './discovery'
import type { SongHit } from './getsongbpm'
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
    // 12 parça eşleşti ama 40 isim denendi: oran %30.
    const result = validateDiscovery(many(12), 40)
    expect(result.ok).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/could be matched/)
  })

  it('denenen sayısı verilmezse gelen listeyi esas alır', () => {
    expect(validateDiscovery(many(20)).stats.incoming).toBe(20)
    expect(validateDiscovery(many(20), 25).stats.incoming).toBe(25)
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

function chartPage(rows: { id: string; name: string }[]): string {
  return rows
    .map(
      (row) =>
        `<div class="bItm oItm" data-id="${row.id}"><div class="bRank">1</div>` +
        `<a href="/track/${row.id}/x/index.html">${row.name}</a></div>`,
    )
    .join('')
}

describe('collectFromCharts', () => {
  const pages: Record<string, string> = {
    weekly: chartPage([
      { id: 'a', name: 'MEDUZA &amp; Kevin de Vries - 7 Days' },
      { id: 'b', name: 'Adam Beyer - Let Loose' },
    ]),
    trending: chartPage([{ id: 'a', name: 'MEDUZA &amp; Kevin de Vries - 7 Days' }]),
  }

  const hits: Record<string, SongHit[]> = {
    'MEDUZA - 7 Days': [{ title: '7 Days', artist: 'MEDUZA', bpm: 124, key: '8A' }],
    'Adam Beyer - Let Loose': [{ title: 'Let Loose', artist: 'Adam Beyer', bpm: 132, key: '5A' }],
  }

  it('sayfaları okur, isimleri tempo ve keyle eşler', async () => {
    const result = await collectFromCharts({
      pages: ['weekly'],
      fetchPage: (url) => Promise.resolve(pages[url]),
      lookup: (query) => Promise.resolve(hits[query] ?? []),
    })

    expect(result.tracks).toHaveLength(2)
    expect(result.tracks[0]).toMatchObject({ title: '7 Days', bpm: 124, key: '8A', source: 'catalog' })
    expect(result.unmatched).toEqual([])
  })

  it('aynı parça iki listede varsa bir kez sorar', async () => {
    const asked: string[] = []
    const result = await collectFromCharts({
      pages: ['weekly', 'trending'],
      fetchPage: (url) => Promise.resolve(pages[url]),
      lookup: (query) => {
        asked.push(query)
        return Promise.resolve(hits[query] ?? [])
      },
    })

    expect(result.entries).toHaveLength(2)
    expect(asked).toHaveLength(2)
    expect(result.reports.map((report) => report.found)).toEqual([2, 0])
  })

  it('bir sayfa düşerse diğerlerini sürdürür', async () => {
    const result = await collectFromCharts({
      pages: ['kirik', 'weekly'],
      fetchPage: (url) =>
        url === 'kirik' ? Promise.reject(new Error('HTTP 403')) : Promise.resolve(pages[url]),
      lookup: (query) => Promise.resolve(hits[query] ?? []),
    })

    expect(result.reports[0].error).toBe('HTTP 403')
    expect(result.tracks).toHaveLength(2)
  })

  it('eşleşmeyen ismi rapora yazar, çökmez', async () => {
    const result = await collectFromCharts({
      pages: ['weekly'],
      fetchPage: (url) => Promise.resolve(pages[url]),
      lookup: (query) => (query.includes('Let Loose') ? Promise.resolve([]) : Promise.resolve(hits[query])),
    })

    expect(result.tracks).toHaveLength(1)
    expect(result.unmatched).toEqual(['Adam Beyer - Let Loose'])
  })

  it('arama servisi çökerse o parçayı atlar', async () => {
    const result = await collectFromCharts({
      pages: ['weekly'],
      fetchPage: (url) => Promise.resolve(pages[url]),
      lookup: () => Promise.reject(new Error('kota doldu')),
    })

    expect(result.tracks).toEqual([])
    expect(result.unmatched).toHaveLength(2)
  })

  it('servis üst üste düşerse erken durur ve sebebini söyler', async () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({ id: `t${index}`, name: `Sanatçı - Parça ${index}` }))
    let asked = 0
    const result = await collectFromCharts({
      pages: ['cok'],
      fetchPage: () => Promise.resolve(chartPage(rows)),
      lookup: () => {
        asked += 1
        return Promise.reject(new Error('HTTP 401 Invalid API Key, or inactive.'))
      },
    })

    expect(asked).toBe(5)
    expect(result.lookupError).toMatch(/failed 5 times in a row/)
    expect(result.lookupError).toMatch(/Invalid API Key/)
  })

  it('tek tük hata erken durdurmaz', async () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({ id: `t${index}`, name: `Sanatçı - Parça ${index}` }))
    let asked = 0
    const result = await collectFromCharts({
      pages: ['bazen'],
      fetchPage: () => Promise.resolve(chartPage(rows)),
      lookup: () => {
        asked += 1
        return asked % 2 === 0 ? Promise.reject(new Error('geçici')) : Promise.resolve([])
      },
    })

    expect(asked).toBe(8)
    expect(result.lookupError).toBeNull()
  })
})
