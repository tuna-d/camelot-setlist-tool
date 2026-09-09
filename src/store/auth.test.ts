import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useAuth } from './auth'
import { setSupabaseForTests } from './supabase'

type Listener = (event: string, session: { user: { id: string; email: string } } | null) => void

interface FakeOptions {
  session?: { user: { id: string; email: string } } | null
  signInError?: { message: string } | null
  signUpSession?: boolean
  signUpError?: { message: string } | null
}

let listener: Listener | null = null
let unsubscribed = false

function fakeClient(options: FakeOptions = {}) {
  listener = null
  unsubscribed = false
  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: options.session ?? null } }),
      onAuthStateChange: (callback: Listener) => {
        listener = callback
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                unsubscribed = true
              },
            },
          },
        }
      },
      signInWithPassword: () => Promise.resolve({ error: options.signInError ?? null }),
      signUp: () =>
        Promise.resolve({
          data: { session: options.signUpSession ? { user: { id: 'u1' } } : null },
          error: options.signUpError ?? null,
        }),
      signInWithOAuth: () => Promise.resolve({ error: options.signInError ?? null }),
      signOut: () => Promise.resolve({ error: null }),
    },
  } as unknown as SupabaseClient
}

function reset() {
  useAuth.setState({ status: 'loading', userId: null, email: null, message: null, busy: false })
}

beforeEach(() => {
  reset()
})

describe('useAuth', () => {
  it('Supabase yapılandırılmamışsa giriş kapalı', () => {
    setSupabaseForTests(null)
    const stop = useAuth.getState().init()
    expect(useAuth.getState().status).toBe('disabled')
    stop()
  })

  it('oturum yoksa misafir', async () => {
    setSupabaseForTests(fakeClient())
    const stop = useAuth.getState().init()
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('guest'))
    stop()
    expect(unsubscribed).toBe(true)
  })

  it('oturum varsa kullanıcıyı tanır', async () => {
    setSupabaseForTests(fakeClient({ session: { user: { id: 'u1', email: 'dj@example.com' } } }))
    const stop = useAuth.getState().init()
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('signed-in'))
    expect(useAuth.getState().userId).toBe('u1')
    expect(useAuth.getState().email).toBe('dj@example.com')
    stop()
  })

  it('oturum değişimini dinler', async () => {
    setSupabaseForTests(fakeClient())
    const stop = useAuth.getState().init()
    await vi.waitFor(() => expect(useAuth.getState().status).toBe('guest'))

    listener?.('SIGNED_IN', { user: { id: 'u2', email: 'x@example.com' } })
    expect(useAuth.getState().status).toBe('signed-in')
    expect(useAuth.getState().userId).toBe('u2')

    listener?.('SIGNED_OUT', null)
    expect(useAuth.getState().status).toBe('guest')
    expect(useAuth.getState().userId).toBeNull()
    stop()
  })

  it('yanlış parolada Türkçe ve yol gösteren mesaj', async () => {
    setSupabaseForTests(fakeClient({ signInError: { message: 'Invalid login credentials' } }))
    await useAuth.getState().signInWithPassword('dj@example.com', 'yanlis')
    expect(useAuth.getState().message).toMatch(/Wrong email or password/)
    expect(useAuth.getState().busy).toBe(false)
  })

  it('başarılı girişte mesaj bırakmaz', async () => {
    setSupabaseForTests(fakeClient())
    useAuth.setState({ message: 'eski mesaj' })
    await useAuth.getState().signInWithPassword('dj@example.com', 'dogru')
    expect(useAuth.getState().message).toBeNull()
  })

  it('kayıtta oturum açılmadıysa doğrulama e-postasını söyler', async () => {
    setSupabaseForTests(fakeClient())
    await useAuth.getState().signUpWithPassword('yeni@example.com', 'parola123')
    expect(useAuth.getState().message).toMatch(/confirmation link in your inbox/)
  })

  it('kayıtta oturum açıldıysa sessiz kalır', async () => {
    setSupabaseForTests(fakeClient({ signUpSession: true }))
    await useAuth.getState().signUpWithPassword('yeni@example.com', 'parola123')
    expect(useAuth.getState().message).toBeNull()
  })

  it('kayıtlı e-postada kayıt yerine giriş yapmayı söyler', async () => {
    setSupabaseForTests(fakeClient({ signUpError: { message: 'User already registered' } }))
    await useAuth.getState().signUpWithPassword('dj@example.com', 'parola123')
    expect(useAuth.getState().message).toMatch(/Sign in instead/)
  })

  it('çıkışta misafire döner', async () => {
    setSupabaseForTests(fakeClient({ session: { user: { id: 'u1', email: 'dj@example.com' } } }))
    useAuth.setState({ status: 'signed-in', userId: 'u1', email: 'dj@example.com' })
    await useAuth.getState().signOut()
    const state = useAuth.getState()
    expect(state.status).toBe('guest')
    expect(state.userId).toBeNull()
    expect(state.email).toBeNull()
  })

  it('Google sağlayıcısı kapalıysa nereye bakılacağını söyler', async () => {
    setSupabaseForTests(fakeClient({ signInError: { message: 'Provider is not enabled' } }))
    await useAuth.getState().signInWithGoogle()
    expect(useAuth.getState().message).toMatch(/Authentication → Providers/)
  })

  it('giriş kapalıyken eylemler sessizce hiçbir şey yapmaz', async () => {
    setSupabaseForTests(null)
    await useAuth.getState().signInWithPassword('a@b.c', 'x')
    await useAuth.getState().signOut()
    expect(useAuth.getState().message).toBeNull()
  })
})
