import { describe, expect, it } from 'vitest'
import { buildSeenIndex, seenIn } from './seen'
import type { Setlist, Track } from './types'

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

function setlist(id: string, name: string, trackIds: string[]): Setlist {
  return { id, name, entries: trackIds.map((trackId) => ({ trackId })), createdAt: 0 }
}

function resolver(tracks: Track[]): (id: string) => Track | null {
  return (id) => tracks.find((item) => item.id === id) ?? null
}

describe('seenIn', () => {
  const a = track({ id: 'a' })
  const b = track({ id: 'b' })
  const c = track({ id: 'c' })
  const resolve = resolver([a, b, c])

  it('başka bir sette geçen parçanın set adını verir', () => {
    const index = buildSeenIndex([setlist('s1', 'Cuma', ['a']), setlist('s2', 'Cumartesi', ['b'])], 's2', resolve)
    expect(seenIn(index, a)).toEqual(['Cuma'])
  })

  it('etkin set parçayı daha önce görülmüş yapmaz', () => {
    const index = buildSeenIndex([setlist('s1', 'Cuma', ['a']), setlist('s2', 'Cumartesi', ['b'])], 's2', resolve)
    expect(seenIn(index, b)).toEqual([])
  })

  it('hiçbir sette olmayan parça için boş döner', () => {
    const index = buildSeenIndex([setlist('s1', 'Cuma', ['a'])], 's2', resolve)
    expect(seenIn(index, c)).toEqual([])
  })

  it('etkin sette de olsa başka bir setteyse işaretler', () => {
    const index = buildSeenIndex([setlist('s1', 'Cuma', ['a']), setlist('s2', 'Cumartesi', ['a'])], 's2', resolve)
    expect(seenIn(index, a)).toEqual(['Cuma'])
  })

  it('set adlarını setlerin sırasıyla verir, eklenme sırasıyla değil', () => {
    const index = buildSeenIndex(
      [setlist('s1', 'Birinci', ['a']), setlist('s2', 'İkinci', ['a']), setlist('s3', 'Üçüncü', ['a'])],
      null,
      resolve,
    )
    expect(seenIn(index, a)).toEqual(['Birinci', 'İkinci', 'Üçüncü'])
  })

  it('aynı sette iki kez geçen parçada set adını bir kez yazar', () => {
    const index = buildSeenIndex([setlist('s1', 'Cuma', ['a', 'a'])], null, resolve)
    expect(seenIn(index, a)).toEqual(['Cuma'])
  })

  it('katalog, kütüphane, web ve elle girilen kopyaları sanatçı + başlıktan tanır', () => {
    const inSet = track({ id: 'vl:9', title: 'Ritual (Extended Mix)', artist: 'MANTAVI', source: 'catalog' })
    const index = buildSeenIndex([setlist('s1', 'Cuma', ['vl:9'])], null, resolver([inSet]))
    for (const source of ['library', 'web', 'manual'] as const) {
      const copy = track({ id: `${source}-1`, title: 'ritual', artist: 'Mantavi', source })
      expect(seenIn(index, copy)).toEqual(['Cuma'])
    }
  })

  it('bir set hem kimlikten hem imzadan eşleşince adını bir kez yazar', () => {
    const inSet = track({ id: 'x', title: 'Ritual', artist: 'Mantavi' })
    const copy = track({ id: 'y', title: 'Ritual', artist: 'Mantavi' })
    const index = buildSeenIndex([setlist('s1', 'Cuma', ['x', 'y'])], null, resolver([inSet, copy]))
    expect(seenIn(index, inSet)).toEqual(['Cuma'])
  })

  it('çözülemeyen kimliği yine de kimlikten tanır', () => {
    const index = buildSeenIndex([setlist('s1', 'Cuma', ['gone'])], null, () => null)
    expect(seenIn(index, track({ id: 'gone' }))).toEqual(['Cuma'])
  })

  it('başlığı boş parçaları imzadan birbirine bağlamaz', () => {
    const blank = track({ id: 'x', title: '', artist: '' })
    const index = buildSeenIndex([setlist('s1', 'Cuma', ['x'])], null, resolver([blank]))
    expect(seenIn(index, track({ id: 'y', title: '', artist: '' }))).toEqual([])
  })

  it('adı boş sete okunabilir bir ad verir', () => {
    const index = buildSeenIndex([setlist('s1', '   ', ['a'])], null, resolve)
    expect(seenIn(index, a)).toEqual(['Untitled set'])
  })

  it('bozuk girdide çökmez, okunabilen setleri kullanır', () => {
    const broken = [
      null,
      'set',
      { id: 's0', name: 'Kırık', entries: 'yok' },
      { id: 's1', name: 'Cuma', entries: [null, { trackId: 5 }, { trackId: 'a' }] },
    ] as unknown as Setlist[]
    const index = buildSeenIndex(broken, null, resolve)
    expect(seenIn(index, a)).toEqual(['Cuma'])
    expect(buildSeenIndex(null as unknown as Setlist[], null, resolve).sets.size).toBe(0)
  })

  it('boş set listesinde hiçbir şey işaretlemez', () => {
    expect(seenIn(buildSeenIndex([], null, resolve), a)).toEqual([])
  })

  it('kararlıdır: aynı girdi aynı çıktıyı verir', () => {
    const lists = [setlist('s1', 'Cuma', ['a', 'b']), setlist('s2', 'Cumartesi', ['a'])]
    const first = buildSeenIndex(lists, null, resolve)
    const second = buildSeenIndex(lists, null, resolve)
    expect(seenIn(first, a)).toEqual(seenIn(second, a))
    expect(first).toEqual(second)
  })
})
