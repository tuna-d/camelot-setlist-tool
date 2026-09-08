import { describe, expect, it } from 'vitest'
import { BEATPORT_GENRES, genreUrl } from './beatport'
import { formatReports, refreshCatalog } from './catalog'
import type { Catalog, Track } from './types'

const KEYS = ['G Minor', 'A Minor', 'C Major', 'F# Minor']

/** Her tür sayfası kendi başlıklarını üretsin: imza tekilleştirmesi türleri birbirine karıştırmasın. */
function pageFor(url: string, count = 15): string {
  const slug = url.split('/')[4]
  const tracks = Array.from({ length: count }, (_, i) => ({
    id: `${slug}-${i}`,
    name: `${slug} parça ${i}`,
    bpm: 120 + (i % 10),
    key: { name: KEYS[i % KEYS.length] },
    artists: [{ name: `${slug} sanatçı ${i % 4}` }],
  }))
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ tracks })}</script>`
}

const goodFetcher = (url: string) => Promise.resolve(pageFor(url))

function previousCatalog(count: number): Catalog {
  const tracks: Track[] = Array.from({ length: count }, (_, i) => ({
    id: `old:${i}`,
    title: `Eski ${i}`,
    artist: 'Eski Sanatçı',
    bpm: 124,
    key: '8A',
    genre: `Tür ${i % 4}`,
    source: 'catalog',
  }))
  return { updatedAt: '2020-01-01T00:00:00.000Z', source: 'beatport', strategy: 'next-data', tracks }
}

describe('refreshCatalog', () => {
  it('tüm türleri çeker ve doğrulamayı geçer', async () => {
    const result = await refreshCatalog(goodFetcher)
    expect(result.ok).toBe(true)
    expect(result.reports).toHaveLength(BEATPORT_GENRES.length)
    expect(result.catalog?.tracks).toHaveLength(BEATPORT_GENRES.length * 15)
    expect(result.catalog?.strategy).toBe('next-data')
    expect(result.catalog?.source).toBe('beatport')
    expect(result.reports.every((report) => report.error === null)).toBe(true)
  })

  it('istenen adresleri çağırır', async () => {
    const calls: string[] = []
    await refreshCatalog((url) => {
      calls.push(url)
      return Promise.resolve(pageFor(url))
    })
    expect(calls).toEqual(BEATPORT_GENRES.map(genreUrl))
  })

  it('tek türün hatası diğerlerini düşürmez', async () => {
    const result = await refreshCatalog((url) =>
      url.includes('tech-house')
        ? Promise.reject(new Error('503 Beatport yanıt vermedi'))
        : Promise.resolve(pageFor(url)),
    )
    const failed = result.reports.find((report) => report.genre === 'Tech House')
    expect(failed?.error).toMatch(/503/)
    expect(failed?.count).toBe(0)
    expect(result.reports.filter((report) => report.count > 0)).toHaveLength(
      BEATPORT_GENRES.length - 1,
    )
    expect(result.ok).toBe(true)
  })

  it('parça çıkaramayan tür için ne yapılacağını yazar', async () => {
    const result = await refreshCatalog((url) =>
      url.includes('house/5') ? Promise.resolve('<html>boş sayfa</html>') : Promise.resolve(pageFor(url)),
    )
    const empty = result.reports.find((report) => report.genre === 'House')
    expect(empty?.error).toMatch(/beatport.ts/)
  })

  it('doğrulama geçmezse eski katalogu korur', async () => {
    const previous = previousCatalog(300)
    const result = await refreshCatalog(() => Promise.resolve('<html>boş</html>'), previous)
    expect(result.ok).toBe(false)
    expect(result.catalog).toBe(previous)
    expect(result.validation.reasons.length).toBeGreaterThan(0)
    // Aday yine de incelenebilsin diye duruyor.
    expect(result.candidate.tracks).toEqual([])
  })

  it('eski katalog yoksa ve doğrulama geçmezse null döner', async () => {
    const result = await refreshCatalog(() => Promise.resolve('<html>boş</html>'))
    expect(result.ok).toBe(false)
    expect(result.catalog).toBeNull()
  })

  it('tüm türler çökerse rapor dolu kalır', async () => {
    const result = await refreshCatalog(() => Promise.reject(new Error('ağ yok')))
    expect(result.reports).toHaveLength(BEATPORT_GENRES.length)
    expect(result.reports.every((report) => report.error === 'ağ yok')).toBe(true)
    expect(result.ok).toBe(false)
  })

  it('yalnızca istenen türleri çeker', async () => {
    const result = await refreshCatalog(goodFetcher, null, BEATPORT_GENRES.slice(0, 2))
    expect(result.reports).toHaveLength(2)
  })
})

describe('formatReports', () => {
  it('tür başına satır ve toplam özet yazar', async () => {
    const result = await refreshCatalog(goodFetcher)
    const text = formatReports(result)
    expect(text).toContain('✓ Tech House: 15 parça (next-data)')
    expect(text).toContain('toplam 135 parça')
  })

  it('doğrulama geçmediğinde sebepleri sıralar', async () => {
    const result = await refreshCatalog(() => Promise.resolve('<html>boş</html>'))
    const text = formatReports(result)
    expect(text).toContain('doğrulama geçmedi:')
    expect(text).toMatch(/en az 100/)
  })
})
