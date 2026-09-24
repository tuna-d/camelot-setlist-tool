import { beforeEach, describe, expect, it } from 'vitest'
import {
  initialAppState,
  selectActive,
  selectEntries,
  selectEntryRows,
  selectExclude,
  selectGenres,
  selectLibrary,
  selectPool,
  selectReference,
  selectEnergyScale,
  selectSeenIndex,
  selectTrack,
  useStore,
} from './store'
import type { RekordboxLibrary } from '../lib/rekordbox'
import { entryEnergy } from '../lib/energy'
import { seenIn } from '../lib/seen'
import type { Catalog, Track } from '../lib/types'

function track(partial: Partial<Track> & { id: string }): Track {
  return {
    title: `Parça ${partial.id}`,
    artist: 'Sanatçı',
    bpm: 124,
    key: '8A',
    source: 'library',
    ...partial,
  }
}

const library: Track[] = [
  track({ id: '1', genre: 'Tech House' }),
  track({ id: '2', genre: 'Techno' }),
  track({ id: '3', genre: 'Tech House' }),
]

const imported: RekordboxLibrary = {
  tracks: library,
  playlists: [
    { id: 'p1', name: 'Açılış', trackIds: ['1', '2'] },
    { id: 'p2', name: 'Kapanış', trackIds: ['3'] },
  ],
  version: '6.7.7',
  stats: { total: 3, skipped: 0, missingBpm: 0, missingKey: 0, missingLocation: 0, ghostReferences: 0 },
}

const catalog: Catalog = {
  updatedAt: '2026-01-01T00:00:00.000Z',
  source: 'beatport',
  strategy: 'next-data',
  tracks: [track({ id: 'c1', source: 'catalog', genre: 'Deep House' })],
}

beforeEach(() => {
  useStore.setState({ ...initialAppState(), catalog: null, sync: { status: 'idle', message: null, savedAt: null } })
})

describe('setlist düzenleme', () => {
  it('parça ekler, siler ve sıralar', () => {
    const store = useStore.getState()
    store.importLibrary(imported)
    store.addTrack(library[0])
    store.addTrack(library[1])
    store.addTrack(library[2])
    expect(selectEntries(useStore.getState()).map((item) => item.id)).toEqual(['1', '2', '3'])

    useStore.getState().moveEntry(2, 0)
    expect(selectEntries(useStore.getState()).map((item) => item.id)).toEqual(['3', '1', '2'])

    useStore.getState().removeEntry(1)
    expect(selectEntries(useStore.getState()).map((item) => item.id)).toEqual(['3', '2'])
  })

  it('aralık dışındaki taşımada listeyi bozmaz', () => {
    const store = useStore.getState()
    store.importLibrary(imported)
    store.addTrack(library[0])
    useStore.getState().moveEntry(5, 0)
    useStore.getState().moveEntry(0, 99)
    expect(selectEntries(useStore.getState()).map((item) => item.id)).toEqual(['1'])
  })

  it('parça notu ve set notu tutar', () => {
    const store = useStore.getState()
    store.importLibrary(imported)
    store.addTrack(library[0])
    useStore.getState().setEntryNote(0, 'ışıklar kısılsın')
    useStore.getState().setSetlistNote('cuma gecesi')
    const active = selectActive(useStore.getState())
    expect(active.entries[0].note).toBe('ışıklar kısılsın')
    expect(active.note).toBe('cuma gecesi')
  })

  it('parçaya enerji puanı verir, aynı yıldıza basınca kaldırır', () => {
    useStore.getState().addTrack(track({ id: '1' }))

    useStore.getState().setEntryEnergy(0, 4)
    expect(selectActive(useStore.getState()).entries[0].energy).toBe(4)

    useStore.getState().setEntryEnergy(0, 4)
    expect(selectActive(useStore.getState()).entries[0].energy).toBeUndefined()
  })

  it('verilen puan havuz değişince de yerinde kalır, tahmin kayda yazılmaz', () => {
    const rated = track({ id: '1', bpm: 128 })
    useStore.getState().addTrack(rated)
    useStore.getState().addTrack(track({ id: '2', bpm: 122 }))
    useStore.getState().setEntryEnergy(0, 2)

    useStore.getState().importLibrary(imported)
    useStore.getState().setPoolSource('library')
    const state = useStore.getState()
    const entries = selectActive(state).entries
    expect(entryEnergy(selectEnergyScale(state), entries[0], rated)).toEqual({ level: 2, rated: true })

    const exported = state.exportState().setlists[0].entries
    expect(exported[0]).toEqual({ trackId: '1', energy: 2 })
    expect(exported[1]).toEqual({ trackId: '2' })
  })

  it('enerji ölçeği havuzdan kurulur ve havuz değişmedikçe aynı kalır', () => {
    const state = useStore.getState()
    expect(selectEnergyScale(state)).toBe(selectEnergyScale(state))
    useStore.getState().setTolerance(8)
    expect(selectEnergyScale(useStore.getState())).toBe(selectEnergyScale(state))

    useStore.getState().importLibrary(imported)
    useStore.getState().setPoolSource('library')
    expect(selectEnergyScale(useStore.getState()).all).toHaveLength(3)
  })

  it('aralık dışındaki enerji puanını yok sayar', () => {
    useStore.getState().addTrack(track({ id: '1' }))
    for (const bad of [0, 6, -3, Number.NaN]) {
      useStore.getState().setEntryEnergy(0, bad)
      expect(selectActive(useStore.getState()).entries[0].energy).toBeUndefined()
    }
  })

  it('kütüphanede olmayan parçayı extras’a yazar', () => {
    const manual = track({ id: 'm1', title: 'Elle girilen', source: 'manual' })
    useStore.getState().addTrack(manual)
    expect(useStore.getState().extras).toHaveLength(1)
    expect(selectTrack(useStore.getState(), 'm1')?.title).toBe('Elle girilen')
  })

  it('kütüphanedeki parçayı extras’a kopyalamaz', () => {
    const store = useStore.getState()
    store.importLibrary(imported)
    useStore.getState().addTrack(library[0])
    expect(useStore.getState().extras).toEqual([])
  })

  it('replaceEntries seti baştan kurar ve imleci sona alır', () => {
    const store = useStore.getState()
    store.importLibrary(imported)
    store.addTrack(library[0])
    useStore.getState().replaceEntries([library[2], library[1]])
    expect(selectEntries(useStore.getState()).map((item) => item.id)).toEqual(['3', '2'])
    expect(useStore.getState().cursor).toBe(1)
  })

  it('temizleme girdileri siler, seti bırakır', () => {
    const store = useStore.getState()
    store.importLibrary(imported)
    store.addTrack(library[0])
    useStore.getState().clearSetlist()
    expect(selectEntries(useStore.getState())).toEqual([])
    expect(useStore.getState().setlists).toHaveLength(1)
  })
})

describe('çoklu setlist', () => {
  it('setlistler birbirinden bağımsız', () => {
    const store = useStore.getState()
    store.importLibrary(imported)
    store.addTrack(library[0])

    const secondId = useStore.getState().newSetlist('İkinci')
    useStore.getState().addTrack(library[1])
    expect(selectEntries(useStore.getState()).map((item) => item.id)).toEqual(['2'])

    const firstId = useStore.getState().setlists[0].id
    useStore.getState().selectSetlist(firstId)
    expect(selectEntries(useStore.getState()).map((item) => item.id)).toEqual(['1'])

    useStore.getState().selectSetlist(secondId)
    expect(selectEntries(useStore.getState()).map((item) => item.id)).toEqual(['2'])
  })

  it('yeniden adlandırır, boş ada dokunmaz', () => {
    const id = useStore.getState().setlists[0].id
    useStore.getState().renameSetlist(id, 'Cuma')
    expect(useStore.getState().setlists[0].name).toBe('Cuma')
    useStore.getState().renameSetlist(id, '   ')
    expect(useStore.getState().setlists[0].name).toBe('Cuma')
  })

  it('son setlist silinince boş bir tane bırakır', () => {
    const id = useStore.getState().setlists[0].id
    useStore.getState().removeSetlist(id)
    const state = useStore.getState()
    expect(state.setlists).toHaveLength(1)
    expect(state.setlists[0].id).not.toBe(id)
    expect(state.setlists[0].entries).toEqual([])
    expect(state.activeId).toBe(state.setlists[0].id)
  })

  it('aktif olmayan setlist silinince aktif değişmez', () => {
    const firstId = useStore.getState().setlists[0].id
    const secondId = useStore.getState().newSetlist('İkinci')
    useStore.getState().removeSetlist(firstId)
    expect(useStore.getState().activeId).toBe(secondId)
  })
})

describe('playlist süzgeci', () => {
  it('görünümü daraltır ama tam koleksiyonu saklar', () => {
    const store = useStore.getState()
    store.importLibrary(imported)
    store.selectPlaylist('p1')

    expect(selectLibrary(useStore.getState()).map((item) => item.id)).toEqual(['1', '2'])
    expect(useStore.getState().exportState().library).toHaveLength(3)
    expect(useStore.getState().library).toHaveLength(3)
  })

  it('bilinmeyen playlist kimliğinde tüm koleksiyonu gösterir', () => {
    const store = useStore.getState()
    store.importLibrary(imported)
    store.selectPlaylist('yok')
    expect(selectLibrary(useStore.getState())).toHaveLength(3)
  })
})

describe('havuz ve seçiciler', () => {
  it('havuz kaynağına göre katalog ya da kütüphane döner', () => {
    const store = useStore.getState()
    store.importLibrary(imported)
    store.setCatalog(catalog)
    expect(selectPool(useStore.getState()).map((item) => item.id)).toEqual(['c1'])
    useStore.getState().setPoolSource('library')
    expect(selectPool(useStore.getState())).toHaveLength(3)
  })

  it('katalog yokken havuz boş ama çökmez', () => {
    expect(selectPool(useStore.getState())).toEqual([])
    expect(selectGenres(useStore.getState())).toEqual([])
  })

  it('referans parça imleçtekidir, imleç taşarsa sondakidir', () => {
    const store = useStore.getState()
    store.importLibrary(imported)
    store.addTrack(library[0])
    useStore.getState().addTrack(library[1])
    expect(selectReference(useStore.getState())?.id).toBe('2')
    useStore.getState().setCursor(0)
    expect(selectReference(useStore.getState())?.id).toBe('1')
    useStore.getState().setCursor(99)
    expect(selectReference(useStore.getState())?.id).toBe('2')
  })

  it('boş sette referans yok', () => {
    expect(selectReference(useStore.getState())).toBeNull()
  })

  it('sette olan parçalar öneri dışı', () => {
    const store = useStore.getState()
    store.importLibrary(imported)
    store.addTrack(library[0])
    const exclude = selectExclude(useStore.getState())
    expect(exclude.has('1')).toBe(true)
    expect(exclude.has('sanatçı|parça 1')).toBe(true)
  })

  it('başka setteki parçayı, kataloğa başka kimlikle gelse de daha önce görülmüş sayar', () => {
    const store = useStore.getState()
    store.importLibrary(imported)
    store.addTrack(library[0])
    useStore.getState().renameSetlist(useStore.getState().setlists[0].id, 'Cuma')
    useStore.getState().newSetlist('Cumartesi')

    const index = selectSeenIndex(useStore.getState())
    expect(seenIn(index, track({ id: 'vl:1', title: 'Parça 1', source: 'catalog' }))).toEqual(['Cuma'])
    expect(seenIn(index, library[1])).toEqual([])
  })

  it('setten çıkan parçanın işareti kalkar', () => {
    const store = useStore.getState()
    store.importLibrary(imported)
    store.addTrack(library[0])
    const secondId = useStore.getState().newSetlist('İkinci')
    expect(seenIn(selectSeenIndex(useStore.getState()), library[0])).toEqual(['Set 1'])

    useStore.getState().selectSetlist(useStore.getState().setlists[0].id)
    useStore.getState().removeEntry(0)
    useStore.getState().selectSetlist(secondId)
    expect(seenIn(selectSeenIndex(useStore.getState()), library[0])).toEqual([])
  })

  it('durum değişmedikçe aynı indeksi döner', () => {
    const state = useStore.getState()
    expect(selectSeenIndex(state)).toBe(selectSeenIndex(state))
    useStore.getState().setTolerance(8)
    expect(selectSeenIndex(useStore.getState())).toBe(selectSeenIndex(state))
  })

  it('havuzdaki türleri alfabetik verir', () => {
    const store = useStore.getState()
    store.importLibrary(imported)
    store.setPoolSource('library')
    expect(selectGenres(useStore.getState())).toEqual(['Tech House', 'Techno'])
  })
})

describe('süzgeç ayarları', () => {
  it('ilişki ve tür çipleri açılıp kapanır', () => {
    useStore.getState().toggleRelation('same')
    expect(useStore.getState().relations).not.toContain('same')
    useStore.getState().toggleRelation('same')
    expect(useStore.getState().relations).toContain('same')

    useStore.getState().toggleGenre('Techno')
    expect(useStore.getState().genres).toEqual(['Techno'])
    useStore.getState().toggleGenre('Techno')
    expect(useStore.getState().genres).toEqual([])
  })

  it('tolerans ayarlanır', () => {
    useStore.getState().setTolerance(9)
    expect(useStore.getState().tolerance).toBe(9)
  })
})

describe('imleç', () => {
  it('eklenen her parça imleci kendine alır', () => {
    useStore.getState().addTrack(track({ id: '1' }))
    expect(useStore.getState().cursor).toBe(0)
    useStore.getState().addTrack(track({ id: '2' }))
    useStore.getState().addTrack(track({ id: '3' }))
    expect(useStore.getState().cursor).toBe(2)
  })

  it('öneriler son eklenen parçadan üretilir', () => {
    useStore.getState().addTrack(track({ id: '1', key: '8A', bpm: 120 }))
    useStore.getState().addTrack(track({ id: '2', key: '9A', bpm: 128 }))
    expect(selectReference(useStore.getState())?.id).toBe('2')
  })

  it('elle seçilen satır imleçte kalır', () => {
    useStore.getState().addTrack(track({ id: '1' }))
    useStore.getState().addTrack(track({ id: '2' }))
    useStore.getState().setCursor(0)
    expect(selectReference(useStore.getState())?.id).toBe('1')
  })

  it('başka bir sete geçince o setin sonundan devam eder', () => {
    useStore.getState().addTrack(track({ id: '1' }))
    useStore.getState().addTrack(track({ id: '2' }))
    const first = useStore.getState().activeId!
    useStore.getState().newSetlist('İkinci')
    expect(useStore.getState().cursor).toBe(0)

    useStore.getState().selectSetlist(first)
    expect(useStore.getState().cursor).toBe(1)
  })

  it('boş sete geçince imleç başa döner', () => {
    useStore.getState().addTrack(track({ id: '1' }))
    const full = useStore.getState().activeId!
    const empty = useStore.getState().newSetlist('Boş')
    useStore.getState().selectSetlist(full)
    useStore.getState().selectSetlist(empty)
    expect(useStore.getState().cursor).toBe(0)
  })

  it('kayıt açılırken setin sonuna konumlanır', () => {
    useStore.getState().addTrack(track({ id: '1' }))
    useStore.getState().addTrack(track({ id: '2' }))
    const exported = { ...useStore.getState().exportState(), cursor: 0 }
    useStore.setState({ ...initialAppState(), catalog: null })
    useStore.getState().hydrate(exported)
    useStore.getState().focusSetEnd()
    expect(useStore.getState().cursor).toBe(1)
  })
})

describe('bulunamayan giriş', () => {
  // The middle entry points at a track no source holds any more, as after a
  // catalog refresh drops it.
  function withMissingMiddle() {
    const store = useStore.getState()
    store.importLibrary(imported)
    store.addTrack(library[0])
    useStore.getState().addTrack(library[1])
    const active = selectActive(useStore.getState())
    useStore.setState({
      setlists: [
        {
          ...active,
          entries: [
            { trackId: '1', note: 'bir' },
            { trackId: 'kayıp', note: 'kayıp' },
            { trackId: '2', note: 'iki', energy: 4 },
          ],
        },
      ],
    })
  }

  it('satırlar gerçek giriş indeksini ve notunu taşır, bulunamayanı atlamaz', () => {
    withMissingMiddle()
    const rows = selectEntryRows(useStore.getState())
    expect(rows.map((row) => [row.index, row.track?.id ?? null, row.entry.note])).toEqual([
      [0, '1', 'bir'],
      [1, null, 'kayıp'],
      [2, '2', 'iki'],
    ])
  })

  it('imleç bulunamayan girişin ardındaysa referans doğru parçadır', () => {
    withMissingMiddle()
    useStore.getState().setCursor(2)
    expect(selectReference(useStore.getState())?.id).toBe('2')
  })

  it('imleç bulunamayan girişteyse referans ondan önceki parçadır', () => {
    withMissingMiddle()
    useStore.getState().setCursor(1)
    expect(selectReference(useStore.getState())?.id).toBe('1')
  })

  it('önünde parça yoksa referans ardındaki ilk parçadır', () => {
    withMissingMiddle()
    useStore.getState().removeEntry(0)
    useStore.getState().setCursor(0)
    expect(selectReference(useStore.getState())?.id).toBe('2')
  })

  it('hiçbir giriş bulunamıyorsa referans yok', () => {
    withMissingMiddle()
    useStore.getState().removeEntry(0)
    useStore.getState().removeEntry(1)
    expect(selectReference(useStore.getState())).toBeNull()
  })

  it('bulunamayan girişi silmek sonrakilerin notunu ve puanını korur', () => {
    withMissingMiddle()
    useStore.getState().removeEntry(1)
    expect(selectActive(useStore.getState()).entries).toEqual([
      { trackId: '1', note: 'bir' },
      { trackId: '2', note: 'iki', energy: 4 },
    ])
  })
})

describe('favoriler', () => {
  it('kalbe basınca ekler, tekrar basınca çıkarır', () => {
    useStore.getState().toggleFavorite(track({ id: 'c1', source: 'catalog' }))
    expect(useStore.getState().favorites.map((item) => item.id)).toEqual(['c1'])
    useStore.getState().toggleFavorite(track({ id: 'c1', source: 'catalog' }))
    expect(useStore.getState().favorites).toEqual([])
  })

  it('favori eklemek seti değiştirmez', () => {
    useStore.getState().toggleFavorite(track({ id: '1' }))
    expect(selectActive(useStore.getState()).entries).toEqual([])
  })

  it('dışa aktarımla gidip gelir', () => {
    useStore.getState().toggleFavorite(track({ id: 'w1', source: 'web' }))
    const exported = useStore.getState().exportState()
    useStore.setState({ ...initialAppState(), catalog: null })
    useStore.getState().hydrate(exported)
    expect(useStore.getState().favorites.map((item) => item.id)).toEqual(['w1'])
  })

  it('favorisi olmayan eski kayıt ekrandaki favorileri silmez', () => {
    useStore.getState().toggleFavorite(track({ id: '1' }))
    useStore.getState().hydrate({ library: [] })
    expect(useStore.getState().favorites).toHaveLength(1)
  })

  it('bozuk favori listesinde çökmez', () => {
    useStore.getState().hydrate({ favorites: [null, { id: 'x' }] as unknown as Track[] })
    expect(useStore.getState().favorites).toEqual([])
  })
})

describe('dışa/içe aktarım', () => {
  it('durum kayıpsız gidip geliyor', () => {
    const store = useStore.getState()
    store.importLibrary(imported)
    store.selectPlaylist('p1')
    store.addTrack(library[0])
    useStore.getState().setEntryNote(0, 'not')
    useStore.getState().setTolerance(8)
    useStore.getState().newSetlist('İkinci')

    const exported = useStore.getState().exportState()
    useStore.setState({ ...initialAppState(), catalog: null })
    useStore.getState().hydrate(exported)

    const state = useStore.getState()
    expect(state.library).toHaveLength(3)
    expect(state.playlists).toHaveLength(2)
    expect(state.playlistId).toBe('p1')
    expect(state.setlists).toHaveLength(2)
    expect(state.tolerance).toBe(8)
    expect(state.setlists[0].entries[0].note).toBe('not')
    expect(state.activeId).toBe(exported.activeId)
  })

  it('bozuk activeId ile gelen kayıt ilk sete düşer', () => {
    const exported = { ...useStore.getState().exportState(), activeId: 'olmayan-set' }
    useStore.getState().hydrate(exported)
    const state = useStore.getState()
    expect(state.activeId).toBe(state.setlists[0].id)
  })

  it('setlisti olmayan kayıtta mevcut seti korur', () => {
    const before = useStore.getState().setlists[0].id
    useStore.getState().hydrate({ setlists: [], library: [] })
    expect(useStore.getState().setlists[0].id).toBe(before)
  })

  it('eksik alanlarla gelen kayıtta varsayılanlara düşer', () => {
    useStore.getState().hydrate({ library: [track({ id: 'x' })] })
    const state = useStore.getState()
    expect(state.library).toHaveLength(1)
    expect(state.tolerance).toBe(initialAppState().tolerance)
    expect(state.relations).toEqual(initialAppState().relations)
  })
})
