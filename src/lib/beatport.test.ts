import { describe, expect, it } from 'vitest'
import {
  BEATPORT_GENRES,
  MIN_TRACKS_PER_STRATEGY,
  extractTracks,
  genreUrl,
  normalizeBpm,
  scanJsonObjects,
  validateCatalog,
} from './beatport'
import type { Track } from './types'

const KEYS = ['G Minor', 'A Minor', 'C Major', 'F# Minor', 'D Major', 'E Minor']

function fakeTrackObjects(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: 1000 + i,
    name: `Parça ${i}`,
    bpm: 120 + (i % 12),
    key: { name: KEYS[i % KEYS.length] },
    artists: [{ name: `Sanatçı ${i % 5}` }],
  }))
}

/** 1. strateji: sayfanın kendi verdiği `__NEXT_DATA__` bloğu. */
function nextDataHtml(count: number): string {
  const payload = JSON.stringify({ props: { pageProps: { tracks: fakeTrackObjects(count) } } })
  return `<html><body><div>liste</div><script id="__NEXT_DATA__" type="application/json">${payload}</script></body></html>`
}

/** 2. strateji: gömülü JSON — betiğin içinde, kaçışsız. */
function embeddedJsonHtml(count: number): string {
  const payload = JSON.stringify(fakeTrackObjects(count))
  return `<html><script>window.__DATA__ = {"results": ${payload}};</script></html>`
}

/** 2. strateji: RSC akışı — veri bir dizenin içinde kaçışlı duruyor. */
function rscHtml(count: number): string {
  const payload = JSON.stringify(fakeTrackObjects(count))
  const escaped = payload.replace(/"/g, '\\"')
  return `<html><script>self.__next_f.push([1,"3:[\\"$\\",\\"div\\",null,{\\"tracks\\":${escaped}}]\\n"])</script></html>`
}

/** 3. strateji: düz HTML metni. */
function plainHtml(count: number): string {
  const rows = Array.from({ length: count }, (_, i) => {
    const key = KEYS[i % KEYS.length]
    return `<div class="row"><a href="/track/parca-${i}/${2000 + i}">Parça ${i}</a><a href="/artist/sanatci-${i % 5}/${i % 5}">Sanatçı ${i % 5}</a><span>${120 + (i % 12)} BPM - ${key}</span></div>`
  })
  return `<html><body>${rows.join('')}</body></html>`
}

describe('scanJsonObjects', () => {
  it('iç içe nesnelerde doğru sınırı bulur', () => {
    const text = 'önek {"a":1,"inner":{"b":2},"bpm":128} sonek'
    expect(scanJsonObjects(text, '"bpm"')).toEqual([{ a: 1, inner: { b: 2 }, bpm: 128 }])
  })

  it('dize içindeki süslü parantezi saymaz', () => {
    // Regex ile kesen bir çıkarıcı burada bozuk JSON üretirdi.
    const text = '{"name":"Set {live} mix","bpm":124}'
    expect(scanJsonObjects(text, '"bpm"')).toEqual([{ name: 'Set {live} mix', bpm: 124 }])
  })

  it('kaçışlı tırnağı dizenin sonu sanmaz', () => {
    const text = '{"name":"Becca\\"s Booty","bpm":126}'
    expect(scanJsonObjects(text, '"bpm"')).toEqual([{ name: 'Becca"s Booty', bpm: 126 }])
  })

  it('birden çok nesneyi sırayla toplar', () => {
    const text = '[{"bpm":120},{"bpm":124},{"x":1}]'
    expect(scanJsonObjects(text, '"bpm"')).toHaveLength(2)
  })

  it('eşleşme yoksa boş dizi', () => {
    expect(scanJsonObjects('düz metin', '"bpm"')).toEqual([])
    expect(scanJsonObjects('', '"bpm"')).toEqual([])
  })

  it('yarım kalan nesnede çökmez', () => {
    expect(scanJsonObjects('{"bpm":128', '"bpm"')).toEqual([])
  })
})

describe('normalizeBpm', () => {
  it('yarım tempoyu ikiye katlar, çift tempoyu ikiye böler', () => {
    expect(normalizeBpm(70)).toBe(140)
    expect(normalizeBpm(174)).toBe(87)
    expect(normalizeBpm(124)).toBe(124)
    expect(normalizeBpm(90)).toBe(90)
    expect(normalizeBpm(165)).toBe(165)
  })

  it('anlamsız değere dokunmaz', () => {
    expect(normalizeBpm(0)).toBe(0)
    expect(normalizeBpm(Number.NaN)).toBeNaN()
  })
})

describe('extractTracks — üç strateji', () => {
  it('__NEXT_DATA__ bloğundan okur', () => {
    const result = extractTracks(nextDataHtml(20), 'Tech House')
    expect(result.strategy).toBe('next-data')
    expect(result.tracks).toHaveLength(20)
    expect(result.tracks[0]).toMatchObject({
      title: 'Parça 0',
      artist: 'Sanatçı 0',
      bpm: 120,
      key: '6A',
      genre: 'Tech House',
      source: 'catalog',
    })
  })

  it('gömülü JSON’dan okur', () => {
    const result = extractTracks(embeddedJsonHtml(15), 'House')
    expect(result.strategy).toBe('embedded-json')
    expect(result.tracks).toHaveLength(15)
  })

  it('kaçışlı RSC akışından okur', () => {
    const result = extractTracks(rscHtml(15), 'House')
    expect(result.strategy).toBe('embedded-json')
    expect(result.tracks.length).toBeGreaterThanOrEqual(MIN_TRACKS_PER_STRATEGY)
  })

  it('düz HTML metninden okur', () => {
    const result = extractTracks(plainHtml(18), 'Deep House')
    expect(result.strategy).toBe('plain-html')
    expect(result.tracks).toHaveLength(18)
    expect(result.tracks[0]).toMatchObject({
      id: 'bp:2000',
      title: 'Parça 0',
      artist: 'Sanatçı 0',
      bpm: 120,
      key: '6A',
    })
  })

  it('10’dan az parça bulan stratejiye güvenmez', () => {
    // __NEXT_DATA__ yalnızca 3 parça veriyor; düz HTML 15 veriyor, o kazanmalı.
    const html = nextDataHtml(3).replace('</body>', `${plainHtml(15)}</body>`)
    const result = extractTracks(html)
    expect(result.strategy).toBe('plain-html')
    expect(result.tracks).toHaveLength(15)
  })

  it('sayfa yapısı tanınmazsa boş döner', () => {
    expect(extractTracks('<html><body>hiçbir şey</body></html>')).toEqual({
      tracks: [],
      strategy: 'none',
    })
    expect(extractTracks('')).toEqual({ tracks: [], strategy: 'none' })
  })

  it('bozuk __NEXT_DATA__ JSON’unda çökmez', () => {
    const html = '<script id="__NEXT_DATA__" type="application/json">{bozuk</script>'
    expect(extractTracks(html).tracks).toEqual([])
  })

  it('key’i okunamayan parçayı almaz', () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      tracks: [{ id: 1, name: 'Keysiz', bpm: 124, artists: [{ name: 'X' }] }],
    })}</script>`
    expect(extractTracks(html).tracks).toEqual([])
  })

  it('aynı parçayı iki kez almaz', () => {
    const doubled = nextDataHtml(12).replace(
      '</script>',
      `</script><script>${JSON.stringify(fakeTrackObjects(12))}</script>`,
    )
    expect(extractTracks(doubled).tracks).toHaveLength(12)
  })
})

describe('genreUrl ve tür listesi', () => {
  it('tür adresini kurar', () => {
    expect(genreUrl(BEATPORT_GENRES[0])).toBe(
      'https://www.beatport.com/genre/melodic-house-techno/90/top-100',
    )
  })

  it('dokuz tür tanımlı ve kimlikleri tekil', () => {
    expect(BEATPORT_GENRES).toHaveLength(9)
    expect(new Set(BEATPORT_GENRES.map((genre) => genre.id)).size).toBe(9)
  })
})

describe('validateCatalog', () => {
  function catalogTracks(count: number, patch: (i: number) => Partial<Track> = () => ({})): Track[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `bp:${i}`,
      title: `Parça ${i}`,
      artist: `Sanatçı ${i % 5}`,
      bpm: 120 + (i % 20),
      key: '8A',
      genre: `Tür ${i % 4}`,
      source: 'catalog' as const,
      ...patch(i),
    }))
  }

  it('sağlıklı katalogu geçirir', () => {
    const result = validateCatalog(catalogTracks(120))
    expect(result.ok).toBe(true)
    expect(result.reasons).toEqual([])
    expect(result.stats.count).toBe(120)
  })

  it('100 parçanın altını reddeder', () => {
    const result = validateCatalog(catalogTracks(99))
    expect(result.ok).toBe(false)
    expect(result.reasons[0]).toMatch(/en az 100/)
  })

  it('key okunma oranı %95’in altındaysa reddeder', () => {
    const result = validateCatalog(catalogTracks(120, (i) => (i % 10 === 0 ? { key: null } : {})))
    expect(result.ok).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/key'i okunabildi/)
  })

  it('BPM aralığı dışındaki parçalar çoğaldıysa reddeder', () => {
    const result = validateCatalog(catalogTracks(120, (i) => (i % 5 === 0 ? { bpm: 40 } : {})))
    expect(result.ok).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/Temposu 90–165/)
  })

  it('üçten az tür varsa reddeder', () => {
    const result = validateCatalog(catalogTracks(120, () => ({ genre: 'Tek Tür' })))
    expect(result.ok).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/en az 3 bekleniyor/)
  })

  it('eski katalogun yarısından küçükse reddeder', () => {
    const result = validateCatalog(catalogTracks(120), catalogTracks(300))
    expect(result.ok).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/yarısından küçük/)
  })

  it('boş katalogda tüm sebepleri sayar', () => {
    const result = validateCatalog([])
    expect(result.ok).toBe(false)
    expect(result.reasons.length).toBeGreaterThanOrEqual(4)
  })

  it('"sayfa yapısı değişti" senaryosunda ok:false döner', () => {
    // Çıkarım kırıldığında elde birkaç kırıntı kalıyor; bu asla yayına çıkmamalı.
    const broken = extractTracks('<html><body><a href="/track/x/1">X</a></body></html>')
    const result = validateCatalog(broken.tracks, catalogTracks(300))
    expect(result.ok).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/beatport.ts/)
  })
})
