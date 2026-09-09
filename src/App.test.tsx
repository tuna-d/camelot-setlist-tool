import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useAuth } from './store/auth'
import { initialAppState, useStore } from './store/store'
import { setSupabaseForTests } from './store/supabase'
import { clearLocal, writeLocal } from './store/sync'
import type { AppState } from './lib/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Mounted {
  container: HTMLElement
  html: () => string
  unmount: () => Promise<void>
}

async function mountApp(): Promise<Mounted> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<App />)
  })
  return {
    container,
    html: () => container.innerHTML,
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

/** Yalnızca App'in dokunduğu kadarını taklit eder: oturum ve boş tablolar. */
function fakeClient(session: { user: { id: string; email: string } } | null) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  Object.assign(builder, {
    select: chain,
    eq: chain,
    order: chain,
    upsert: () => Promise.resolve({ data: null, error: null }),
    delete: chain,
    in: chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  })

  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => builder,
  } as unknown as Parameters<typeof setSupabaseForTests>[0]
}

function guestState(): AppState {
  const base = initialAppState()
  return {
    ...base,
    savedAt: 10,
    library: [
      { id: '1', title: 'Gece', artist: 'Ayla', bpm: 124, key: '8A', source: 'library' },
    ],
    setlists: [{ ...base.setlists[0], name: 'Misafir seti', entries: [{ trackId: '1' }] }],
  }
}

beforeEach(() => {
  clearLocal()
  setSupabaseForTests(null)
  useStore.setState({
    ...initialAppState(),
    catalog: null,
    sync: { status: 'idle', message: null, savedAt: null },
  })
  useAuth.setState({ status: 'disabled', userId: null, email: null, message: null, busy: false })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('', { status: 404 })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('giriş kapalıyken uyarı gösterir ve panelleri çizer', async () => {
    const view = await mountApp()
    expect(view.html()).toContain('Camelot Setlist')
    expect(view.html()).toContain('yalnızca bu tarayıcıda')
    expect(view.html()).toContain('Setlist')
    expect(view.html()).toContain('Öneriler')
    await view.unmount()
  })

  it('giriş kapalıyken giriş düğmesi çıkmaz', async () => {
    const view = await mountApp()
    const labels = [...view.container.querySelectorAll('button')].map((item) => item.textContent)
    expect(labels).not.toContain('giriş yap')
    await view.unmount()
  })

  it('misafirken kayıt uyarısı ve giriş düğmesi gösterir', async () => {
    setSupabaseForTests(fakeClient(null))
    const view = await mountApp()
    expect(view.html()).toContain('Misafir olarak çalışıyorsun')
    const labels = [...view.container.querySelectorAll('button')].map((item) => item.textContent)
    expect(labels).toContain('giriş yap')
    await view.unmount()
  })

  it('tarayıcıdaki misafir kaydını yükler', async () => {
    setSupabaseForTests(fakeClient(null))
    writeLocal(guestState())
    const view = await mountApp()
    expect(view.html()).toContain('Misafir seti')
    expect(useStore.getState().library).toHaveLength(1)
    await view.unmount()
  })

  it('girişte oturum sahibinin e-postasını ve çıkış düğmesini gösterir', async () => {
    setSupabaseForTests(fakeClient({ user: { id: 'u1', email: 'dj@example.com' } }))
    const view = await mountApp()
    expect(view.html()).toContain('dj@example.com')
    const labels = [...view.container.querySelectorAll('button')].map((item) => item.textContent)
    expect(labels).toContain('çıkış')
    await view.unmount()
  })
})
