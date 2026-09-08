import { describe, expect, it } from 'vitest'
import { dedupeBySignature, fold, localSearch, queryWords } from './search'
import type { Track } from './types'

function track(partial: Partial<Track> & { id: string }): Track {
  return {
    title: 'Parça',
    artist: 'Sanatçı',
    bpm: 124,
    key: '8A',
    source: 'catalog',
    ...partial,
  }
}

const pool: Track[] = [
  track({ id: '1', title: 'Şarkı Söyle', artist: 'Ayla Çelik' }),
  track({ id: '2', title: 'Gece Yürüyüşü', artist: 'Mor Ötesi' }),
  track({ id: '3', title: 'The Rapture Pt. III', artist: '&ME' }),
  track({ id: '4', title: 'Rapture', artist: 'Deniz K.' }),
  track({ id: '5', title: 'Ilık Rüzgar', artist: 'İpek' }),
  track({ id: '6', title: 'Kum Saati', artist: 'Deniz K.' }),
]

describe('fold', () => {
  it('Türkçe karakterleri katlar', () => {
    expect(fold('Şarkı Söyle')).toBe('sarki soyle')
    expect(fold('Gece Yürüyüşü')).toBe('gece yuruyusu')
    expect(fold('İpek ÇİĞDEM')).toBe('ipek cigdem')
    expect(fold('Ilık')).toBe('ilik')
  })

  it('noktalamayı boşluğa çevirir, kenarları kırpar', () => {
    expect(fold('  Pt. III — (Original)  ')).toBe('pt iii original')
    expect(fold('&ME')).toBe('me')
  })

  it('anlamsız girdide boş metin', () => {
    expect(fold('(((')).toBe('')
    expect(fold('   ')).toBe('')
  })
})

describe('queryWords', () => {
  it('kelimelere ayırır', () => {
    expect(queryWords('sarki soyle')).toEqual(['sarki', 'soyle'])
    expect(queryWords('(((')).toEqual([])
    expect(queryWords('')).toEqual([])
  })
})

describe('localSearch', () => {
  it('Türkçe karakter yazmadan bulur', () => {
    expect(localSearch('sarki soyle', pool).map((item) => item.id)).toEqual(['1'])
    expect(localSearch('yuruyus', pool).map((item) => item.id)).toEqual(['2'])
  })

  it('büyük/küçük harf ve noktalama umursamaz', () => {
    expect(localSearch('ŞARKI', pool).map((item) => item.id)).toEqual(['1'])
    expect(localSearch('pt iii', pool).map((item) => item.id)).toEqual(['3'])
    expect(localSearch('&me', pool).map((item) => item.id)).toEqual(['3'])
  })

  it('çok kelimeli sorguda her kelime geçmeli', () => {
    expect(localSearch('deniz kum', pool).map((item) => item.id)).toEqual(['6'])
    expect(localSearch('deniz olmayan', pool)).toEqual([])
  })

  it('sanatçı adından da bulur', () => {
    expect(localSearch('mor', pool).map((item) => item.id)).toEqual(['2'])
  })

  it('kelime başı eşleşmesi içinde geçmesini yener', () => {
    const list = localSearch('rapture', pool).map((item) => item.id)
    expect(list).toContain('3')
    expect(list).toContain('4')
    expect(list[0]).toBe('4')
  })

  it('başlık eşleşmesi sanatçı eşleşmesini yener', () => {
    const mixed = [
      track({ id: 'a', title: 'Uzak Bir Yer', artist: 'Gece' }),
      track({ id: 'b', title: 'Gece', artist: 'Uzak' }),
    ]
    expect(localSearch('gece', mixed).map((item) => item.id)).toEqual(['b', 'a'])
  })

  it('kendi kütüphanendeki parça önce gelir', () => {
    const mixed = [
      track({ id: 'katalog', title: 'Kum Saati', source: 'catalog' }),
      track({ id: 'kutuphane', title: 'Kum Saati', source: 'library' }),
    ]
    expect(localSearch('kum saati', mixed)[0].id).toBe('kutuphane')
  })

  it('anlamsız ve boş sorguda boş liste', () => {
    expect(localSearch('(((', pool)).toEqual([])
    expect(localSearch('', pool)).toEqual([])
    expect(localSearch('   ', pool)).toEqual([])
    expect(localSearch('sarki', [])).toEqual([])
  })

  it('limit uygular', () => {
    expect(localSearch('a', pool, 2)).toHaveLength(2)
  })

  it('aynı sorgu aynı sırayı verir', () => {
    const first = localSearch('deniz', pool).map((item) => item.id)
    const second = localSearch('deniz', pool).map((item) => item.id)
    expect(second).toEqual(first)
  })
})

describe('dedupeBySignature', () => {
  it('katalog kopyası yerine kütüphane kopyasını tutar', () => {
    const list = [
      track({ id: 'katalog', title: 'Kum Saati (Original Mix)', artist: 'Deniz K.', source: 'catalog' }),
      track({ id: 'kutuphane', title: 'Kum Saati', artist: 'Deniz K', source: 'library' }),
    ]
    const out = dedupeBySignature(list)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('kutuphane')
  })

  it('kopya ilk görüldüğü sırada kalır', () => {
    const list = [
      track({ id: 'a', title: 'Bir', source: 'catalog' }),
      track({ id: 'b', title: 'İki', source: 'catalog' }),
      track({ id: 'c', title: 'Bir', source: 'library' }),
    ]
    expect(dedupeBySignature(list).map((item) => item.id)).toEqual(['c', 'b'])
  })

  it('farklı parçalara dokunmaz', () => {
    expect(dedupeBySignature(pool)).toHaveLength(pool.length)
    expect(dedupeBySignature([])).toEqual([])
  })

  it('remix ayrı parça sayılır', () => {
    const list = [
      track({ id: 'a', title: 'Gece', artist: 'Ayla' }),
      track({ id: 'b', title: 'Gece (Tale Of Us Remix)', artist: 'Ayla' }),
    ]
    expect(dedupeBySignature(list)).toHaveLength(2)
  })
})
