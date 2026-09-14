import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  STORAGE_KEY,
  bootstrapGuest,
  bootstrapUser,
  clearLocal,
  createSaver,
  readBackup,
  hasContent,
  isAppState,
  pickNewer,
  readLocal,
  writeBackup,
  writeLocal,
} from './sync'
import { initialAppState } from './store'
import type { RemoteStore } from './remote'
import type { AppState, Track } from '../lib/types'

function track(id: string): Track {
  return { id, title: `Parça ${id}`, artist: 'Sanatçı', bpm: 124, key: '8A', source: 'library' }
}

function stateAt(savedAt: number, name = 'Set 1', entries: { trackId: string }[] = []): AppState {
  const base = initialAppState()
  return { ...base, savedAt, setlists: [{ ...base.setlists[0], name, entries }] }
}

interface FakeRemote extends RemoteStore {
  saves: { userId: string; state: AppState }[]
}

function fakeRemote(options: {
  state?: AppState | null
  loadError?: string
  conflictWith?: AppState
  saveError?: string
} = {}): FakeRemote {
  const saves: { userId: string; state: AppState }[] = []
  return {
    saves,
    load: () =>
      Promise.resolve({ state: options.state ?? null, error: options.loadError ?? null }),
    save: (userId, state) => {
      saves.push({ userId, state })
      if (options.conflictWith) {
        return Promise.resolve({
          ok: false,
          conflict: true,
          remote: options.conflictWith,
          message: 'Başka bir cihazda daha yeni bir kayıt var',
        })
      }
      if (options.saveError) {
        return Promise.resolve({ ok: false, conflict: false, remote: null, message: options.saveError })
      }
      return Promise.resolve({ ok: true, conflict: false, remote: null, message: null })
    },
  }
}

beforeEach(() => {
  clearLocal()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('isAppState ve pickNewer', () => {
  it('iskeleti doğrular', () => {
    expect(isAppState(stateAt(1))).toBe(true)
    expect(isAppState({ setlists: [], library: [] })).toBe(false)
  })

  it('damgası yeni olanı seçer, eşitlikte yereli tutar', () => {
    expect(pickNewer(stateAt(100, 'eski'), stateAt(200, 'yeni'))?.setlists[0].name).toBe('yeni')
    expect(pickNewer(stateAt(100, 'yerel'), stateAt(100, 'uzak'))?.setlists[0].name).toBe('yerel')
    expect(pickNewer(null, null)).toBeNull()
  })
})

describe('hasContent', () => {
  it('boş çalışmayı taşımaya değer saymaz', () => {
    expect(hasContent(null)).toBe(false)
    expect(hasContent(stateAt(1))).toBe(false)
  })

  it('sette parça ya da kütüphane varsa taşınmaya değer', () => {
    expect(hasContent(stateAt(1, 'Set', [{ trackId: '1' }]))).toBe(true)
    expect(hasContent({ ...stateAt(1), library: [track('1')] })).toBe(true)
  })

  it('yalnızca favori varsa da taşınmaya değer', () => {
    expect(hasContent({ ...stateAt(1), favorites: [track('1')] })).toBe(true)
  })
})

describe('yerel kayıt', () => {
  it('yazıp okur, bozuk kayıtta çökmez', () => {
    expect(writeLocal(stateAt(5, 'yerel'))).toBe(true)
    expect(readLocal()?.setlists[0].name).toBe('yerel')
    localStorage.setItem(STORAGE_KEY, '{yarım json')
    expect(readLocal()).toBeNull()
  })
})

describe('yedek kayıt', () => {
  it('yedeği ayrı anahtarda tutar, asıl kaydı bozmaz', () => {
    writeLocal(stateAt(1, 'güncel'))
    expect(writeBackup(stateAt(2, 'yedek'))).toBe(true)
    expect(readBackup()?.setlists[0].name).toBe('yedek')
    expect(readLocal()?.setlists[0].name).toBe('güncel')
  })

  it('yedek yokken null döner', () => {
    localStorage.removeItem('camelot-setlist:backup')
    expect(readBackup()).toBeNull()
  })
})

describe('bootstrapGuest', () => {
  it('yalnızca tarayıcıdaki kaydı kullanır', () => {
    writeLocal(stateAt(10, 'misafir'))
    const result = bootstrapGuest()
    expect(result.state?.setlists[0].name).toBe('misafir')
    expect(result.sync.status).toBe('local')
    expect(result.pendingGuest).toBeNull()
  })

  it('kayıt yoksa boş döner', () => {
    expect(bootstrapGuest().state).toBeNull()
  })
})

describe('bootstrapUser', () => {
  it('hesaptaki kayıt misafir çalışmasının üzerine yazmaz', async () => {
    writeLocal(stateAt(9000, 'misafir seti', [{ trackId: '1' }]))
    const result = await bootstrapUser(fakeRemote({ state: stateAt(10, 'hesaptaki') }), 'u1')

    expect(result.state?.setlists[0].name).toBe('hesaptaki')
    expect(result.pendingGuest?.setlists[0].name).toBe('misafir seti')
    expect(result.sync.message).toMatch(/You can move the set/)
  })

  it('misafir çalışması boşsa taşıma önerisi çıkmaz', async () => {
    writeLocal(stateAt(9000, 'boş'))
    const result = await bootstrapUser(fakeRemote({ state: stateAt(10, 'hesaptaki') }), 'u1')
    expect(result.pendingGuest).toBeNull()
    expect(result.sync.message).toBeNull()
  })

  it('hesap boşsa yereldeki çalışmayı devralır', async () => {
    writeLocal(stateAt(10, 'yerel', [{ trackId: '1' }]))
    const result = await bootstrapUser(fakeRemote({ state: null }), 'u1')
    expect(result.state?.setlists[0].name).toBe('yerel')
    expect(result.sync.message).toMatch(/will be saved to your account/)
  })

  it('okuma hatasında yerelle devam eder ve durumu söyler', async () => {
    writeLocal(stateAt(10, 'yerel'))
    const result = await bootstrapUser(fakeRemote({ loadError: 'sunucu yok' }), 'u1')
    expect(result.state?.setlists[0].name).toBe('yerel')
    expect(result.sync.status).toBe('offline')
    expect(result.sync.message).toBe('sunucu yok')
  })
})

describe('createSaver', () => {
  it('misafirken sunucuya hiç yazmaz', async () => {
    const remote = fakeRemote()
    const statuses: string[] = []
    const saver = createSaver({
      store: null,
      userId: null,
      onConflict: () => {},
      onSync: (sync) => {
        if (sync.status) statuses.push(sync.status)
      },
      delay: 0,
    })

    saver.save(stateAt(1, 'misafir'))
    await saver.flush()

    expect(remote.saves).toEqual([])
    expect(statuses).toEqual(['local'])
    // Tarayıcıya yine de yazılır: yenilemede çalışma kaybolmasın.
    expect(readLocal()?.setlists[0].name).toBe('misafir')
  })

  it('girişliyken kullanıcı kimliğiyle kaydeder', async () => {
    vi.useFakeTimers()
    const remote = fakeRemote()
    const saver = createSaver({
      store: remote,
      userId: 'u1',
      onConflict: () => {},
      onSync: () => {},
      delay: 2500,
    })

    saver.save(stateAt(1))
    expect(remote.saves).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(2500)
    expect(remote.saves).toEqual([{ userId: 'u1', state: expect.objectContaining({ savedAt: 1 }) }])
  })

  it('arka arkaya değişiklikte tek yazma yapar', async () => {
    vi.useFakeTimers()
    const remote = fakeRemote()
    const saver = createSaver({
      store: remote,
      userId: 'u1',
      onConflict: () => {},
      onSync: () => {},
      delay: 2500,
    })

    saver.save(stateAt(1))
    await vi.advanceTimersByTimeAsync(1000)
    saver.save(stateAt(2))
    await vi.advanceTimersByTimeAsync(2500)
    expect(remote.saves).toHaveLength(1)
  })

  it('çakışmada sunucudaki kayda geçer', async () => {
    const adopted: AppState[] = []
    const statuses: string[] = []
    const saver = createSaver({
      store: fakeRemote({ conflictWith: stateAt(900, 'sunucudaki') }),
      userId: 'u1',
      onConflict: (state) => adopted.push(state),
      onSync: (sync) => {
        if (sync.status) statuses.push(sync.status)
      },
      delay: 0,
    })

    saver.save(stateAt(100, 'yerel'))
    await saver.flush()

    expect(adopted[0].setlists[0].name).toBe('sunucudaki')
    expect(statuses).toEqual(['saving', 'conflict'])
    expect(readLocal()?.setlists[0].name).toBe('sunucudaki')
  })

  it('yazma hatasında offline durumuna geçer', async () => {
    const statuses: string[] = []
    const saver = createSaver({
      store: fakeRemote({ saveError: 'yazılamadı' }),
      userId: 'u1',
      onConflict: () => {},
      onSync: (sync) => {
        if (sync.status) statuses.push(sync.status)
      },
      delay: 0,
    })
    saver.save(stateAt(1))
    await saver.flush()
    expect(statuses).toEqual(['saving', 'offline'])
  })

  it('iptal edilen kayıt sunucuya gitmez', async () => {
    vi.useFakeTimers()
    const remote = fakeRemote()
    const saver = createSaver({
      store: remote,
      userId: 'u1',
      onConflict: () => {},
      onSync: () => {},
      delay: 2500,
    })
    saver.save(stateAt(1))
    saver.cancel()
    await vi.advanceTimersByTimeAsync(5000)
    expect(remote.saves).toEqual([])
  })
})
