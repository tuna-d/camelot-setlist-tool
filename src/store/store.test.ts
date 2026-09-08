import { beforeEach, describe, expect, it } from 'vitest'
import {
  initialAppState,
  selectActive,
  selectEntries,
  selectExclude,
  selectGenres,
  selectLibrary,
  selectPool,
  selectReference,
  selectTrack,
  useStore,
} from './store'
import type { RekordboxLibrary } from '../lib/rekordbox'
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
    expect(selectReference(useStore.getState())?.id).toBe('1')
    useStore.getState().setCursor(1)
    expect(selectReference(useStore.getState())?.id).toBe('2')
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
