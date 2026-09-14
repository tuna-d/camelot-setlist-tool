import { describe, expect, it } from 'vitest'
import { mergeGuestWork } from './merge'
import type { AppState, Setlist, Track } from './types'

function track(id: string): Track {
  return { id, title: `Parça ${id}`, artist: 'Sanatçı', bpm: 124, key: '8A', source: 'library' }
}

function setlist(id: string, name: string, trackIds: string[] = []): Setlist {
  return { id, name, entries: trackIds.map((trackId) => ({ trackId })), createdAt: 1735000000000 }
}

function state(partial: Partial<AppState> = {}): AppState {
  return {
    library: [],
    extras: [],
    favorites: [],
    playlists: [],
    playlistId: null,
    setlists: [setlist('set-a', 'Set 1')],
    activeId: 'set-a',
    cursor: 0,
    tolerance: 6,
    relations: ['same'],
    genres: [],
    poolSource: 'catalog',
    savedAt: 1000,
    ...partial,
  }
}

describe('mergeGuestWork', () => {
  it('hesaptaki setleri korur, misafir setini sona ekler', () => {
    const account = state({
      setlists: [setlist('a1', 'Cuma', ['1']), setlist('a2', 'Cumartesi', ['2'])],
      library: [track('1'), track('2')],
    })
    const guest = state({
      setlists: [setlist('g1', 'Misafir', ['3'])],
      library: [track('3')],
    })

    const merged = mergeGuestWork(account, guest)
    expect(merged.setlists.map((item) => item.name)).toEqual(['Cuma', 'Cumartesi', 'Misafir'])
    expect(merged.setlists[0].entries).toHaveLength(1)
    expect(merged.library.map((item) => item.id)).toEqual(['1', '2', '3'])
  })

  it('boş misafir setini taşımaz', () => {
    const merged = mergeGuestWork(
      state({ setlists: [setlist('a1', 'Cuma', ['1'])] }),
      state({ setlists: [setlist('g1', 'Boş'), setlist('g2', 'Dolu', ['9'])] }),
    )
    expect(merged.setlists.map((item) => item.name)).toEqual(['Cuma', 'Dolu'])
  })

  it('kimlik çakışmasında taşınan sete yeni kimlik verir', () => {
    const merged = mergeGuestWork(
      state({ setlists: [setlist('set-1', 'Hesap', ['1'])] }),
      state({ setlists: [setlist('set-1', 'Misafir', ['2'])] }),
    )
    expect(merged.setlists).toHaveLength(2)
    expect(merged.setlists[0].id).toBe('set-1')
    expect(merged.setlists[1].id).not.toBe('set-1')
    expect(merged.setlists[1].entries[0].trackId).toBe('2')
  })

  it('ad çakışmasında taşınanı ayırt edilir yapar', () => {
    const merged = mergeGuestWork(
      state({ setlists: [setlist('a1', 'Set 1', ['1'])] }),
      state({ setlists: [setlist('g1', 'Set 1', ['2'])] }),
    )
    expect(merged.setlists[1].name).toBe('Set 1 (moved)')
  })

  it('aynı parçayı kütüphaneye iki kez yazmaz', () => {
    const merged = mergeGuestWork(
      state({ library: [track('1')], extras: [track('x')] }),
      state({ library: [track('1'), track('2')], extras: [track('x')] }),
    )
    expect(merged.library.map((item) => item.id)).toEqual(['1', '2'])
    expect(merged.extras.map((item) => item.id)).toEqual(['x'])
  })

  it('misafir favorilerini hesabınkilerin arkasına ekler, tekrarı atar', () => {
    const merged = mergeGuestWork(
      state({ favorites: [track('1'), track('2')] }),
      state({ favorites: [track('2'), track('3')] }),
    )
    expect(merged.favorites.map((item) => item.id)).toEqual(['1', '2', '3'])
  })

  it('favori listesi olmayan eski misafir kaydında çökmez', () => {
    const guest = { ...state(), favorites: undefined } as unknown as AppState
    expect(mergeGuestWork(state({ favorites: [track('1')] }), guest).favorites).toHaveLength(1)
  })

  it('taşınan seti aktif yapar ve imleci başa alır', () => {
    const merged = mergeGuestWork(
      state({ setlists: [setlist('a1', 'Cuma', ['1'])], activeId: 'a1', cursor: 3 }),
      state({ setlists: [setlist('g1', 'Misafir', ['2'])] }),
    )
    expect(merged.activeId).toBe('g1')
    expect(merged.cursor).toBe(0)
  })

  it('taşınacak set yoksa hesabın aktif setini bozmaz', () => {
    const merged = mergeGuestWork(
      state({ setlists: [setlist('a1', 'Cuma', ['1'])], activeId: 'a1', cursor: 2 }),
      state({ setlists: [setlist('g1', 'Boş')] }),
    )
    expect(merged.activeId).toBe('a1')
    expect(merged.cursor).toBe(2)
  })

  it('hesabın süzgeç ayarlarını korur', () => {
    const merged = mergeGuestWork(
      state({ tolerance: 9, poolSource: 'library', genres: ['Techno'] }),
      state({ tolerance: 3, poolSource: 'catalog', genres: [] }),
    )
    expect(merged.tolerance).toBe(9)
    expect(merged.poolSource).toBe('library')
    expect(merged.genres).toEqual(['Techno'])
  })

  it('damgayı tazeler ki kayıt sunucuya gitsin', () => {
    const merged = mergeGuestWork(state({ savedAt: 1 }), state({ savedAt: 2 }))
    expect(merged.savedAt).toBeGreaterThan(2)
  })
})
