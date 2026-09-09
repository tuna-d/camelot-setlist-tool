import { beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseStore } from './remote'
import type { AppState, Track } from '../lib/types'

interface Tables {
  libraries: Record<string, unknown>[]
  setlists: Record<string, unknown>[]
  settings: Record<string, unknown>[]
}

let tables: Tables
let failOn: string | null = null

/** Kullandığımız zincirin (select/eq/order/maybeSingle/upsert/delete/in) bellek içi taklidi. */
function fakeClient(): SupabaseClient {
  function query(table: keyof Tables) {
    const filters: ((row: Record<string, unknown>) => boolean)[] = []
    let orderBy: string | null = null
    let operation: 'select' | 'delete' = 'select'

    const rows = () => {
      const found = tables[table].filter((row) => filters.every((test) => test(row)))
      if (!orderBy) return found
      return [...found].sort((a, b) => Number(a[orderBy!] ?? 0) - Number(b[orderBy!] ?? 0))
    }

    const run = () => {
      if (failOn === table) return { data: null, error: { message: `${table} yazılamadı` } }
      if (operation === 'delete') {
        const doomed = new Set(rows())
        tables[table] = tables[table].filter((row) => !doomed.has(row))
        return { data: null, error: null }
      }
      return { data: rows(), error: null }
    }

    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value)
        return builder
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]))
        return builder
      },
      order: (column: string) => {
        orderBy = column
        return builder
      },
      delete: () => {
        operation = 'delete'
        return builder
      },
      maybeSingle: () => {
        const result = run()
        return Promise.resolve({
          data: Array.isArray(result.data) ? (result.data[0] ?? null) : null,
          error: result.error,
        })
      },
      upsert: (input: Record<string, unknown> | Record<string, unknown>[]) => {
        if (failOn === table) return Promise.resolve({ data: null, error: { message: 'upsert düştü' } })
        for (const row of Array.isArray(input) ? input : [input]) {
          const key = table === 'setlists' ? 'id' : 'user_id'
          const index = tables[table].findIndex((existing) => existing[key] === row[key])
          if (index === -1) tables[table].push({ ...row })
          else tables[table][index] = { ...tables[table][index], ...row }
        }
        return Promise.resolve({ data: null, error: null })
      },
      then: (resolve: (value: { data: unknown; error: { message: string } | null }) => unknown) =>
        Promise.resolve(run()).then(resolve),
    }

    return builder
  }

  return { from: (table: string) => query(table as keyof Tables) } as unknown as SupabaseClient
}

function track(id: string): Track {
  return { id, title: `Parça ${id}`, artist: 'Sanatçı', bpm: 124, key: '8A', source: 'library' }
}

function state(partial: Partial<AppState> = {}): AppState {
  return {
    library: [track('1')],
    extras: [],
    playlists: [],
    playlistId: null,
    setlists: [{ id: 'set-a', name: 'Cuma', entries: [{ trackId: '1' }], createdAt: 1735000000000 }],
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

beforeEach(() => {
  tables = { libraries: [], setlists: [], settings: [] }
  failOn = null
})

describe('createSupabaseStore', () => {
  it('hesapta kayıt yoksa null döner', async () => {
    const store = createSupabaseStore(fakeClient())
    expect(await store.load('u1')).toEqual({ state: null, error: null })
  })

  it('kaydedip geri okur', async () => {
    const store = createSupabaseStore(fakeClient())
    const saved = await store.save('u1', state())
    expect(saved.ok).toBe(true)

    const loaded = await store.load('u1')
    expect(loaded.error).toBeNull()
    expect(loaded.state?.library).toHaveLength(1)
    expect(loaded.state?.setlists[0].name).toBe('Cuma')
    expect(loaded.state?.savedAt).toBe(1000)
  })

  it('kullanıcılar birbirinin kaydını görmez', async () => {
    const store = createSupabaseStore(fakeClient())
    await store.save('u1', state())
    expect((await store.load('u2')).state).toBeNull()
  })

  it('silinen setlisti sunucudan da siler', async () => {
    const store = createSupabaseStore(fakeClient())
    await store.save(
      'u1',
      state({
        setlists: [
          { id: 'set-a', name: 'Cuma', entries: [], createdAt: 1 },
          { id: 'set-b', name: 'Cumartesi', entries: [], createdAt: 2 },
        ],
      }),
    )
    expect(tables.setlists).toHaveLength(2)

    await store.save('u1', state({ savedAt: 2000 }))
    expect(tables.setlists.map((row) => row.id)).toEqual(['set-a'])
  })

  it('sunucudaki kayıt daha yeniyse çakışma bildirir, üzerine yazmaz', async () => {
    const store = createSupabaseStore(fakeClient())
    await store.save('u1', state({ savedAt: 5000, setlists: [{ id: 'set-a', name: 'Sunucudaki', entries: [], createdAt: 1 }] }))

    const result = await store.save('u1', state({ savedAt: 1000, setlists: [{ id: 'set-a', name: 'Eski', entries: [], createdAt: 1 }] }))
    expect(result.conflict).toBe(true)
    expect(result.ok).toBe(false)
    expect(result.remote?.setlists[0].name).toBe('Sunucudaki')
    expect(result.message).toMatch(/tekrar yap ve kaydet/)
    expect(tables.setlists[0].name).toBe('Sunucudaki')
  })

  it('aynı damgada yazmaya izin verir', async () => {
    const store = createSupabaseStore(fakeClient())
    await store.save('u1', state({ savedAt: 1000 }))
    const again = await store.save('u1', state({ savedAt: 1000, tolerance: 9 }))
    expect(again.ok).toBe(true)
    expect(tables.settings[0].tolerance).toBe(9)
  })

  it('yazma hatasında ne yapılacağını söyler', async () => {
    const store = createSupabaseStore(fakeClient())
    failOn = 'libraries'
    const result = await store.save('u1', state())
    expect(result.ok).toBe(false)
    expect(result.conflict).toBe(false)
    expect(result.message).toMatch(/bu cihazda duruyor/)
  })

  it('okuma hatasında açıklayıcı metin döner', async () => {
    const store = createSupabaseStore(fakeClient())
    failOn = 'setlists'
    const result = await store.load('u1')
    expect(result.state).toBeNull()
    expect(result.error).toMatch(/okuma sırasında hata/)
  })
})
