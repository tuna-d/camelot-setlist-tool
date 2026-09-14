import { describe, expect, it } from 'vitest'
import { isFavorite, mergeFavorites, readFavorites, toggleFavorite } from './favorites'
import type { Track } from './types'

function track(partial: Partial<Track> & { id: string }): Track {
  return {
    title: `Parça ${partial.id}`,
    artist: 'Sanatçı',
    bpm: 124,
    key: '8A',
    source: 'catalog',
    ...partial,
  }
}

describe('toggleFavorite', () => {
  it('ekler, yeni ekleneni başa koyar', () => {
    const once = toggleFavorite([], track({ id: '1' }))
    const twice = toggleFavorite(once, track({ id: '2' }))
    expect(twice.map((item) => item.id)).toEqual(['2', '1'])
  })

  it('favorideki parçaya tekrar basınca çıkarır', () => {
    const list = toggleFavorite([], track({ id: '1' }))
    expect(toggleFavorite(list, track({ id: '1' }))).toEqual([])
  })

  it('başka kaynaktan gelen aynı şarkıyı da tanır ve çıkarır', () => {
    const list = [track({ id: 'vl:9', title: 'Ritual', artist: 'MANTAVI' })]
    const fromLibrary = track({ id: 'lib-4', title: 'ritual', artist: 'Mantavi', source: 'library' })
    expect(isFavorite(list, fromLibrary)).toBe(true)
    expect(toggleFavorite(list, fromLibrary)).toEqual([])
  })

  it('girdiyi değiştirmez, kopya saklar', () => {
    const original = track({ id: '1' })
    const list: Track[] = []
    const next = toggleFavorite(list, original)
    expect(list).toEqual([])
    original.title = 'Değişti'
    expect(next[0].title).toBe('Parça 1')
  })

  it('aynı girdi aynı çıktıyı verir', () => {
    const list = [track({ id: '1' })]
    expect(toggleFavorite(list, track({ id: '2' }))).toEqual(toggleFavorite(list, track({ id: '2' })))
  })
})

describe('isFavorite', () => {
  it('boş listede hiçbir şey favori değil', () => {
    expect(isFavorite([], track({ id: '1' }))).toBe(false)
  })

  it('adı farklı parçayı karıştırmaz', () => {
    expect(isFavorite([track({ id: '1', title: 'Gece' })], track({ id: '2', title: 'Sabah' }))).toBe(false)
  })
})

describe('mergeFavorites', () => {
  it('kendi sırasını korur, yalnızca eksikleri sona ekler', () => {
    const mine = [track({ id: '1' }), track({ id: '2' })]
    const theirs = [track({ id: '2' }), track({ id: '3' })]
    expect(mergeFavorites(mine, theirs).map((item) => item.id)).toEqual(['1', '2', '3'])
  })

  it('boş listelerde boş döner', () => {
    expect(mergeFavorites([], [])).toEqual([])
  })
})

describe('readFavorites', () => {
  it('liste olmayan değerde boş döner', () => {
    expect(readFavorites(undefined)).toEqual([])
    expect(readFavorites(null)).toEqual([])
    expect(readFavorites('favoriler')).toEqual([])
    expect(readFavorites({ id: '1' })).toEqual([])
  })

  it('okunamayan satırları atar, iyileri tutar', () => {
    const list = readFavorites([
      null,
      42,
      { id: '', title: 'kimliksiz' },
      { id: 'x', title: '   ' },
      { id: 'ok', title: 'Gece', artist: 'Kiko', bpm: 124, key: '8A', source: 'web' },
    ])
    expect(list).toEqual([{ id: 'ok', title: 'Gece', artist: 'Kiko', bpm: 124, key: '8A', source: 'web' }])
  })

  it('bozuk alanları güvenli varsayılana çevirir', () => {
    const [item] = readFavorites([
      { id: '1', title: 'Gece', artist: 7, bpm: 'hızlı', key: 3, source: 'uzay', duration: -5, genre: '' },
    ])
    expect(item).toEqual({ id: '1', title: 'Gece', artist: '', bpm: null, key: null, source: 'manual' })
  })

  it('isteğe bağlı alanları korur', () => {
    const [item] = readFavorites([
      track({ id: '1', genre: 'Techno', duration: 354, location: 'file:///a.mp3', ext: 'mp3' }),
    ])
    expect(item).toMatchObject({ genre: 'Techno', duration: 354, location: 'file:///a.mp3', ext: 'mp3' })
  })

  it('aynı şarkının tekrarını katlar', () => {
    expect(readFavorites([track({ id: '1' }), track({ id: '1' }), track({ id: '2', title: 'Parça 1' })])).toHaveLength(1)
  })
})
