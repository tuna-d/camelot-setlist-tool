import { describe, expect, it } from 'vitest'
import { DEFAULT_RELATIONS } from './camelot'
import { fromRows, toRows } from './state-rows'
import type { AppState, Track } from './types'

function track(id: string): Track {
  return { id, title: `Parça ${id}`, artist: 'Sanatçı', bpm: 124, key: '8A', source: 'library' }
}

const state: AppState = {
  library: [track('1'), track('2')],
  extras: [track('m1')],
  playlists: [{ id: 'p1', name: 'Açılış', trackIds: ['1'] }],
  playlistId: 'p1',
  setlists: [
    {
      id: 'set-a',
      name: 'Cuma',
      entries: [{ trackId: '1', note: 'ışıklar' }],
      note: 'kapanış',
      createdAt: Date.UTC(2026, 0, 2, 3, 4, 5),
    },
    { id: 'set-b', name: 'Cumartesi', entries: [], createdAt: Date.UTC(2026, 0, 3) },
  ],
  activeId: 'set-b',
  cursor: 1,
  tolerance: 8,
  relations: ['same', 'up'],
  genres: ['Techno'],
  poolSource: 'library',
  savedAt: 1735000000000,
}

describe('toRows', () => {
  it('durumu üç tabloya böler', () => {
    const rows = toRows('user-1', state)
    expect(rows.library).toMatchObject({ user_id: 'user-1', tracks: state.library, extras: state.extras })
    expect(rows.settings).toMatchObject({
      user_id: 'user-1',
      tolerance: 8,
      relations: ['same', 'up'],
      genres: ['Techno'],
      pool_source: 'library',
      playlist_id: 'p1',
      active_setlist_id: 'set-b',
      cursor: 1,
      saved_at: 1735000000000,
    })
  })

  it('setlist sırasını position ile taşır', () => {
    const rows = toRows('user-1', state)
    expect(rows.setlists.map((row) => [row.id, row.position])).toEqual([
      ['set-a', 0],
      ['set-b', 1],
    ])
    expect(rows.setlists[0].note).toBe('kapanış')
    expect(rows.setlists[1].note).toBeNull()
    expect(rows.setlists[0].created_at).toBe('2026-01-02T03:04:05.000Z')
  })
})

describe('fromRows', () => {
  it('gidip gelen durum kayıpsız', () => {
    const rows = toRows('user-1', state)
    expect(fromRows(rows)).toEqual(state)
  })

  it('sırayı position’a göre kurar', () => {
    const rows = toRows('user-1', state)
    const shuffled = { ...rows, setlists: [rows.setlists[1], rows.setlists[0]] }
    expect(fromRows(shuffled).setlists.map((setlist) => setlist.id)).toEqual(['set-a', 'set-b'])
  })

  it('hiç satır yoksa boş bir sete düşer', () => {
    const result = fromRows({ library: null, setlists: [], settings: null })
    expect(result.setlists).toHaveLength(1)
    expect(result.setlists[0].entries).toEqual([])
    expect(result.activeId).toBe(result.setlists[0].id)
    expect(result.library).toEqual([])
    expect(result.relations).toEqual([...DEFAULT_RELATIONS])
    expect(result.tolerance).toBe(6)
    expect(result.poolSource).toBe('catalog')
  })

  it('bozuk alanlarda çökmez', () => {
    const result = fromRows({
      library: { tracks: 'yok' as unknown as Track[], playlists: null as never, extras: undefined },
      setlists: [
        { id: 'set-a', name: '', entries: 'yok' as never, position: 'x' as never },
        { name: 'kimliksiz' },
      ],
      settings: {
        tolerance: 'sekiz' as never,
        relations: null as never,
        cursor: -5,
        pool_source: 'saçma' as never,
        saved_at: undefined,
      },
    })
    expect(result.library).toEqual([])
    expect(result.setlists).toHaveLength(1)
    expect(result.setlists[0].name).toBe('Untitled set')
    expect(result.setlists[0].entries).toEqual([])
    expect(result.tolerance).toBe(6)
    expect(result.cursor).toBe(0)
    expect(result.poolSource).toBe('catalog')
    expect(result.savedAt).toBe(0)
  })

  it('numeric alanlar dize gelirse sayıya çevirir', () => {
    const result = fromRows({
      library: null,
      setlists: [],
      settings: { tolerance: '7.5' as never, saved_at: '1735000000000' as never },
    })
    expect(result.tolerance).toBe(7.5)
    expect(result.savedAt).toBe(1735000000000)
  })

  it('yarım adımlı toleransı bozmadan taşır', () => {
    const rows = toRows('u1', { ...state, tolerance: 6.5 })
    expect(rows.settings.tolerance).toBe(6.5)
  })

  it('bilinmeyen aktif set kimliğinde ilk sete düşer', () => {
    const rows = toRows('user-1', state)
    const broken = { ...rows, settings: { ...rows.settings, active_setlist_id: 'yok' } }
    expect(fromRows(broken).activeId).toBe('set-a')
  })

  it('girdisi bozuk olan setlist satırını temizler', () => {
    const result = fromRows({
      library: null,
      setlists: [{ id: 's1', name: 'Set', entries: [{ trackId: '1' }, { note: 'kimliksiz' } as never] }],
      settings: null,
    })
    expect(result.setlists[0].entries).toEqual([{ trackId: '1' }])
  })
})
