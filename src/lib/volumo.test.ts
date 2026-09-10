import { describe, expect, it } from 'vitest'
import fixture from '../../test/fixtures/volumo-chart.html?raw'
import { VOLUMO_BASE, extractChartLinks, extractTracks, parseDuration, splitCredit } from './volumo'

describe('parseDuration', () => {
  it('dakika:saniyeyi saniyeye çevirir', () => {
    expect(parseDuration('5:54')).toBe(354)
    expect(parseDuration('0:30')).toBe(30)
  })

  it('saat de verilebilir', () => {
    expect(parseDuration('1:02:03')).toBe(3723)
  })

  it('okunamayan girdide tanımsız döner', () => {
    expect(parseDuration(null)).toBeUndefined()
    expect(parseDuration('beş dakika')).toBeUndefined()
    expect(parseDuration('')).toBeUndefined()
  })
})

describe('splitCredit', () => {
  it('künyeyi sanatçı ve başlığa böler', () => {
    expect(splitCredit('Forbidden Society, Drumago — Trashstar (Drumago Remix)')).toEqual({
      artist: 'Forbidden Society, Drumago',
      title: 'Trashstar (Drumago Remix)',
    })
  })

  it('başlıktaki tireyi bozmaz', () => {
    expect(splitCredit('Kiko — Gece - Extended Mix')).toEqual({
      artist: 'Kiko',
      title: 'Gece - Extended Mix',
    })
  })

  it('ayraç yoksa null döner', () => {
    expect(splitCredit('Yalnızca bir isim')).toBeNull()
    expect(splitCredit('')).toBeNull()
  })
})

describe('extractChartLinks', () => {
  const page = `
    <a href="/chart/abc-first">bir</a>
    <a href="/chart/abc-first">aynısı</a>
    <a href="/chart/def-second">iki</a>
    <a href="/album/123-nope">liste değil</a>
  `

  it('liste adreslerini tam adresle döndürür', () => {
    expect(extractChartLinks(page)).toEqual([
      `${VOLUMO_BASE}/chart/abc-first`,
      `${VOLUMO_BASE}/chart/def-second`,
    ])
  })

  it('sayfada liste yoksa boş döner', () => {
    expect(extractChartLinks('<html></html>')).toEqual([])
    expect(extractChartLinks(null as unknown as string)).toEqual([])
  })
})

describe('extractTracks', () => {
  const tracks = extractTracks(fixture)

  it('gerçek sayfadaki bütün parçaları çıkarır', () => {
    expect(tracks).toHaveLength(3)
  })

  it('başlık, sanatçı, tempo ve keyi okur', () => {
    expect(tracks[0]).toMatchObject({
      id: 'vl:6602235',
      title: 'Ritual',
      artist: 'MANTAVI (EGY)',
      bpm: 120,
      key: '9A',
      genre: 'Afro House',
      source: 'catalog',
    })
  })

  it('key metnini Camelot’a çevirir', () => {
    // E minor → 9A, F minor → 4A, C minor → 5A
    expect(tracks.map((track) => track.key)).toEqual(['9A', '4A', '5A'])
  })

  it('süreyi saniyeye çevirir', () => {
    expect(tracks[0].duration).toBe(354)
  })

  it('her satırın temposu kendi satırından gelir', () => {
    expect(tracks.map((track) => track.bpm)).toEqual([120, 122, 124])
  })

  it('aynı parçayı iki kez döndürmez', () => {
    expect(extractTracks(fixture + fixture)).toHaveLength(3)
  })

  it('boş ya da alakasız girdide boş dizi döner', () => {
    expect(extractTracks('')).toEqual([])
    expect(extractTracks('<html><body>hiçbir şey</body></html>')).toEqual([])
    expect(extractTracks(null as unknown as string)).toEqual([])
  })

  it('eksik alanlarda çökmez, bilinmeyeni null bırakır', () => {
    const broken = '<a href="/track/999-yarim">Yarım Parça</a>'
    const [track] = extractTracks(broken)
    expect(track).toMatchObject({ id: 'vl:999', title: 'Yarım Parça', bpm: null, key: null })
    expect(track.duration).toBeUndefined()
  })

  it('sayfada tür yoksa verilen türe düşer', () => {
    const broken = '<a href="/track/5-x">Parça</a>'
    expect(extractTracks(broken, 'Techno')[0].genre).toBe('Techno')
  })

  it('aynı girdi aynı çıktıyı verir', () => {
    expect(extractTracks(fixture)).toEqual(tracks)
  })
})
