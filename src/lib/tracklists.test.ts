import { describe, expect, it } from 'vitest'
import fixture from '../../test/fixtures/tracklists-weekly.html?raw'
import { decodeEntities, extractChart, splitName } from './tracklists'

describe('decodeEntities', () => {
  it('adlandırılmış varlıkları çözer', () => {
    expect(decodeEntities('MEDUZA &amp; Kevin')).toBe('MEDUZA & Kevin')
    expect(decodeEntities('Ti&euml;sto')).toBe('Tiësto')
  })

  it('sayısal varlıkları çözer', () => {
    expect(decodeEntities('&#39;t&#233;st&#39;')).toBe("'tést'")
    expect(decodeEntities('&#x41;&#x42;')).toBe('AB')
  })

  it('tanımadığı varlığı olduğu gibi bırakır', () => {
    expect(decodeEntities('&bilinmeyen; kalsın')).toBe('&bilinmeyen; kalsın')
  })

  it('geçersiz kod noktasında çökmez', () => {
    expect(decodeEntities('&#99999999;')).toBe('')
    expect(decodeEntities('')).toBe('')
  })
})

describe('splitName', () => {
  it('ilk ayraçtan böler, kalanı başlıkta bırakır', () => {
    expect(splitName('Adam Beyer - Let Loose - Extended Mix')).toEqual({
      artist: 'Adam Beyer',
      title: 'Let Loose - Extended Mix',
    })
  })

  it('kısa çizgi yoksa hepsini başlık sayar', () => {
    expect(splitName('Voicemail')).toEqual({ artist: '', title: 'Voicemail' })
  })

  it('uzun tireleri de ayraç kabul eder', () => {
    expect(splitName('Kiko – Gece')).toEqual({ artist: 'Kiko', title: 'Gece' })
  })
})

describe('extractChart', () => {
  const entries = extractChart(fixture)

  it('gerçek sayfadan bütün satırları çıkarır', () => {
    expect(entries).toHaveLength(4)
  })

  it('sıra, sanatçı ve başlığı ayırır', () => {
    expect(entries[0]).toMatchObject({
      id: 'm7strq8x',
      rank: 1,
      artist: 'MEDUZA & Kevin de Vries',
      title: '7 Days',
    })
  })

  it('plak şirketi ve DJ desteğini okur', () => {
    expect(entries[0].label).toBe('TOMORROWLAND')
    expect(entries[0].support).toBeGreaterThan(0)
  })

  it('sıralama sayfadaki sırayı korur', () => {
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 3, 4])
  })

  it('aynı parçayı iki kez döndürmez', () => {
    expect(extractChart(fixture + fixture)).toHaveLength(4)
  })

  it('boş ya da alakasız girdide boş dizi döner', () => {
    expect(extractChart('')).toEqual([])
    expect(extractChart('<html><body>hiçbir şey</body></html>')).toEqual([])
    expect(extractChart(null as unknown as string)).toEqual([])
  })

  it('yarım satırda çökmez', () => {
    const broken = '<div class="bItm oItm" data-id="x"><a href="/track/abc/yarim/index.html">Sanatçı - Parça</a>'
    const [entry] = extractChart(broken)
    expect(entry).toMatchObject({ id: 'abc', artist: 'Sanatçı', title: 'Parça', label: null })
  })

  it('aynı girdi aynı çıktıyı verir', () => {
    expect(extractChart(fixture)).toEqual(entries)
  })
})
