import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  STORAGE_KEY,
  bootstrap,
  clearLocal,
  createSaver,
  isAppState,
  pickNewer,
  readLocal,
  readRemote,
  writeLocal,
  writeRemote,
} from './sync'
import { initialAppState } from './store'
import type { AppState } from '../lib/types'

function stateAt(savedAt: number, name = 'Set 1'): AppState {
  const base = initialAppState()
  return { ...base, savedAt, setlists: [{ ...base.setlists[0], name }] }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  clearLocal()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('isAppState', () => {
  it('iskeleti doğrular', () => {
    expect(isAppState(stateAt(1))).toBe(true)
    expect(isAppState(null)).toBe(false)
    expect(isAppState('metin')).toBe(false)
    expect(isAppState({})).toBe(false)
    expect(isAppState({ setlists: [], library: [] })).toBe(false)
    expect(isAppState({ setlists: [], library: [], savedAt: 1 })).toBe(true)
  })
})

describe('pickNewer', () => {
  it('damgası yeni olanı seçer', () => {
    const older = stateAt(100, 'eski')
    const newer = stateAt(200, 'yeni')
    expect(pickNewer(older, newer)?.setlists[0].name).toBe('yeni')
    expect(pickNewer(newer, older)?.setlists[0].name).toBe('yeni')
  })

  it('eşitlikte yereli tutar', () => {
    expect(pickNewer(stateAt(100, 'yerel'), stateAt(100, 'uzak'))?.setlists[0].name).toBe('yerel')
  })

  it('biri yoksa diğerini verir', () => {
    expect(pickNewer(null, stateAt(1))?.savedAt).toBe(1)
    expect(pickNewer(stateAt(2), null)?.savedAt).toBe(2)
    expect(pickNewer(null, null)).toBeNull()
  })
})

describe('yerel kayıt', () => {
  it('yazıp okur', () => {
    expect(writeLocal(stateAt(5, 'yerel'))).toBe(true)
    expect(readLocal()?.setlists[0].name).toBe('yerel')
  })

  it('kayıt yoksa null', () => {
    expect(readLocal()).toBeNull()
  })

  it('bozuk kayıtta çökmez', () => {
    localStorage.setItem(STORAGE_KEY, '{yarım json')
    expect(readLocal()).toBeNull()
    localStorage.setItem(STORAGE_KEY, '{"beklenmedik":true}')
    expect(readLocal()).toBeNull()
  })
})

describe('readRemote', () => {
  it('sunucudaki kaydı okur', async () => {
    const result = await readRemote(() => Promise.resolve(jsonResponse(stateAt(9, 'uzak'))))
    expect(result.state?.setlists[0].name).toBe('uzak')
    expect(result.error).toBeNull()
  })

  it('kayıt yoksa hata saymaz', async () => {
    const result = await readRemote(() => Promise.resolve(new Response(null, { status: 404 })))
    expect(result.state).toBeNull()
    expect(result.error).toBeNull()
  })

  it('sunucu hatasında ne yapılacağını söyler', async () => {
    const result = await readRemote(() => Promise.resolve(new Response('', { status: 500 })))
    expect(result.error).toMatch(/HTTP 500/)
    expect(result.error).toMatch(/ortam değişkenlerini kontrol et/)
  })

  it('ağ yoksa çalışmaya devam edilebileceğini söyler', async () => {
    const result = await readRemote(() => Promise.reject(new Error('ağ yok')))
    expect(result.error).toMatch(/kayıt bu cihazda tutuluyor/)
  })

  it('beklenmedik gövdeyi yok sayar', async () => {
    const result = await readRemote(() => Promise.resolve(jsonResponse({ saçma: true })))
    expect(result.state).toBeNull()
  })
})

describe('writeRemote', () => {
  it('başarılı yazmada ok döner', async () => {
    const result = await writeRemote(stateAt(1), () => Promise.resolve(new Response('', { status: 200 })))
    expect(result).toMatchObject({ ok: true, conflict: false })
  })

  it('409’da sunucudaki kaydı geri verir, üzerine yazmaz', async () => {
    const remote = stateAt(500, 'sunucudaki')
    const result = await writeRemote(stateAt(100), () => Promise.resolve(jsonResponse(remote, 409)))
    expect(result.ok).toBe(false)
    expect(result.conflict).toBe(true)
    expect(result.remote?.setlists[0].name).toBe('sunucudaki')
    expect(result.message).toMatch(/tekrar yap ve kaydet/)
  })

  it('sunucu hatasında değişikliklerin durduğunu söyler', async () => {
    const result = await writeRemote(stateAt(1), () => Promise.resolve(new Response('', { status: 503 })))
    expect(result.message).toMatch(/HTTP 503/)
    expect(result.message).toMatch(/bu cihazda duruyor/)
  })

  it('ağ hatasında çökmez', async () => {
    const result = await writeRemote(stateAt(1), () => Promise.reject(new Error('kopuk')))
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/ulaşılamadı/)
  })
})

describe('bootstrap', () => {
  it('uzak kayıt daha yeniyse onu alır ve haber verir', async () => {
    writeLocal(stateAt(100, 'yerel'))
    const result = await bootstrap(() => Promise.resolve(jsonResponse(stateAt(200, 'uzak'))))
    expect(result.state?.setlists[0].name).toBe('uzak')
    expect(result.sync.message).toMatch(/daha yeni kayıt yüklendi/)
  })

  it('yerel kayıt daha yeniyse sessiz kalır', async () => {
    writeLocal(stateAt(300, 'yerel'))
    const result = await bootstrap(() => Promise.resolve(jsonResponse(stateAt(200, 'uzak'))))
    expect(result.state?.setlists[0].name).toBe('yerel')
    expect(result.sync.message).toBeNull()
  })

  it('sunucu yoksa yerel kayıtla devam eder', async () => {
    writeLocal(stateAt(10, 'yerel'))
    const result = await bootstrap(() => Promise.reject(new Error('ağ yok')))
    expect(result.state?.setlists[0].name).toBe('yerel')
    expect(result.sync.status).toBe('offline')
  })

  it('hiç kayıt yoksa null döner', async () => {
    const result = await bootstrap(() => Promise.resolve(new Response(null, { status: 404 })))
    expect(result.state).toBeNull()
    expect(result.sync.status).toBe('idle')
  })
})

describe('createSaver', () => {
  it('yerele hemen yazar, sunucuya geciktirerek yazar', async () => {
    vi.useFakeTimers()
    const calls: string[] = []
    const saver = createSaver({
      fetchImpl: (url, init) => {
        calls.push(`${init?.method ?? 'GET'} ${url}`)
        return Promise.resolve(new Response('', { status: 200 }))
      },
      onConflict: () => {},
      onSync: () => {},
      delay: 2500,
    })

    saver.save(stateAt(1, 'ilk'))
    expect(readLocal()?.setlists[0].name).toBe('ilk')
    expect(calls).toEqual([])

    await vi.advanceTimersByTimeAsync(2500)
    expect(calls).toEqual(['PUT /api/state'])
  })

  it('arka arkaya kayıtta tek istek atar', async () => {
    vi.useFakeTimers()
    let requests = 0
    const saver = createSaver({
      fetchImpl: () => {
        requests += 1
        return Promise.resolve(new Response('', { status: 200 }))
      },
      onConflict: () => {},
      onSync: () => {},
      delay: 2500,
    })

    saver.save(stateAt(1))
    await vi.advanceTimersByTimeAsync(1000)
    saver.save(stateAt(2))
    await vi.advanceTimersByTimeAsync(1000)
    saver.save(stateAt(3))
    await vi.advanceTimersByTimeAsync(2500)
    expect(requests).toBe(1)
  })

  it('çakışmada sunucudaki kayda geçer ve haber verir', async () => {
    const remote = stateAt(900, 'sunucudaki')
    const adopted: AppState[] = []
    const statuses: string[] = []
    const saver = createSaver({
      fetchImpl: () => Promise.resolve(jsonResponse(remote, 409)),
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
    // Sessizce üzerine yazılmadı: yerel kayıt da sunucudakine güncellendi.
    expect(readLocal()?.setlists[0].name).toBe('sunucudaki')
  })

  it('sunucu erişilemezse offline durumuna geçer', async () => {
    const statuses: string[] = []
    const saver = createSaver({
      fetchImpl: () => Promise.reject(new Error('kopuk')),
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
    let requests = 0
    const saver = createSaver({
      fetchImpl: () => {
        requests += 1
        return Promise.resolve(new Response('', { status: 200 }))
      },
      onConflict: () => {},
      onSync: () => {},
      delay: 2500,
    })
    saver.save(stateAt(1))
    saver.cancel()
    await vi.advanceTimersByTimeAsync(5000)
    expect(requests).toBe(0)
  })
})
