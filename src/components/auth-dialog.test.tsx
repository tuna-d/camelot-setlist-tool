import { beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useAuth } from '../store/auth'
import { setSupabaseForTests } from '../store/supabase'
import { AuthDialog } from './AuthDialog'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Mounted {
  container: HTMLElement
  html: () => string
  unmount: () => Promise<void>
}

async function mount(node: ReactElement): Promise<Mounted> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(node)
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

async function type(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function button(view: Mounted, label: string): HTMLButtonElement {
  const found = [...view.container.querySelectorAll('button')].find(
    (item) => item.textContent === label,
  )
  if (!found) throw new Error(`düğme bulunamadı: ${label}`)
  return found
}

const calls: { email: string; password: string; kind: string }[] = []

function fakeClient(error: { message: string } | null = null) {
  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword: (credentials: { email: string; password: string }) => {
        calls.push({ ...credentials, kind: 'signin' })
        return Promise.resolve({ error })
      },
      signUp: (credentials: { email: string; password: string }) => {
        calls.push({ ...credentials, kind: 'signup' })
        return Promise.resolve({ data: { session: null }, error })
      },
      signInWithOAuth: () => {
        calls.push({ email: '', password: '', kind: 'google' })
        return Promise.resolve({ error })
      },
      signOut: () => Promise.resolve({ error: null }),
    },
  } as unknown as SupabaseClient
}

beforeEach(() => {
  calls.length = 0
  useAuth.setState({ status: 'guest', userId: null, email: null, message: null, busy: false })
  setSupabaseForTests(fakeClient())
})

describe('AuthDialog', () => {
  it('Google ve e-posta seçeneklerini gösterir', async () => {
    const view = await mount(<AuthDialog open onClose={() => {}} />)
    expect(view.html()).toContain('Google ile devam et')
    expect(view.html()).toContain('e-posta')
    expect(view.html()).toContain('setlerin sunucuya kaydedilmez')
    await view.unmount()
  })

  it('Google düğmesi oturum akışını başlatır', async () => {
    const view = await mount(<AuthDialog open onClose={() => {}} />)
    await click(button(view, 'Google ile devam et'))
    expect(calls[0].kind).toBe('google')
    await view.unmount()
  })

  it('kısa parolada giriş düğmesi kapalı kalır', async () => {
    const view = await mount(<AuthDialog open onClose={() => {}} />)
    const inputs = [...view.container.querySelectorAll('input')] as HTMLInputElement[]
    await type(inputs[0], 'dj@example.com')
    await type(inputs[1], '123')
    expect(button(view, 'giriş yap').disabled).toBe(true)
    await type(inputs[1], '123456')
    expect(button(view, 'giriş yap').disabled).toBe(false)
    await view.unmount()
  })

  it('e-posta ile giriş yapar', async () => {
    const view = await mount(<AuthDialog open onClose={() => {}} />)
    const inputs = [...view.container.querySelectorAll('input')] as HTMLInputElement[]
    await type(inputs[0], 'dj@example.com')
    await type(inputs[1], 'parola123')
    await click(button(view, 'giriş yap'))
    expect(calls[0]).toEqual({ kind: 'signin', email: 'dj@example.com', password: 'parola123' })
    await view.unmount()
  })

  it('kayıt kipine geçip hesap açar', async () => {
    const view = await mount(<AuthDialog open onClose={() => {}} />)
    await click(button(view, 'hesabın yok mu? hesap aç'))
    const inputs = [...view.container.querySelectorAll('input')] as HTMLInputElement[]
    await type(inputs[0], 'yeni@example.com')
    await type(inputs[1], 'parola123')
    await click(button(view, 'hesap aç'))
    expect(calls[0].kind).toBe('signup')
    expect(view.html()).toContain('doğrulama bağlantısına tıkla')
    await view.unmount()
  })

  it('hatayı Türkçe gösterir', async () => {
    setSupabaseForTests(fakeClient({ message: 'Invalid login credentials' }))
    const view = await mount(<AuthDialog open onClose={() => {}} />)
    const inputs = [...view.container.querySelectorAll('input')] as HTMLInputElement[]
    await type(inputs[0], 'dj@example.com')
    await type(inputs[1], 'yanlisparola')
    await click(button(view, 'giriş yap'))
    expect(view.html()).toContain('E-posta ya da parola yanlış')
    await view.unmount()
  })

  it('giriş kapalıyken nedenini ve ne olacağını söyler', async () => {
    setSupabaseForTests(null)
    useAuth.setState({ status: 'disabled' })
    const view = await mount(<AuthDialog open onClose={() => {}} />)
    expect(view.html()).toContain('VITE_SUPABASE_URL')
    expect(view.html()).toContain('misafir olarak')
    await view.unmount()
  })
})
