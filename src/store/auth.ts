import { create } from 'zustand'
import { authMessage } from '../lib/auth-message'
import { getSupabase, isAuthConfigured } from './supabase'

export type AuthStatus = 'loading' | 'disabled' | 'guest' | 'signed-in'

export interface AuthState {
  status: AuthStatus
  userId: string | null
  email: string | null
  /** Kullanıcıya gösterilecek hata ya da bilgi metni. */
  message: string | null
  busy: boolean

  init: () => () => void
  signInWithGoogle: () => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUpWithPassword: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  setMessage: (message: string | null) => void
}

export const useAuth = create<AuthState>((set) => ({
  status: isAuthConfigured() ? 'loading' : 'disabled',
  userId: null,
  email: null,
  message: null,
  busy: false,

  init: () => {
    const supabase = getSupabase()
    if (!supabase) {
      set({ status: 'disabled' })
      return () => {}
    }

    void supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      set({
        status: user ? 'signed-in' : 'guest',
        userId: user?.id ?? null,
        email: user?.email ?? null,
      })
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      set({
        status: user ? 'signed-in' : 'guest',
        userId: user?.id ?? null,
        email: user?.email ?? null,
      })
    })

    return () => data.subscription.unsubscribe()
  },

  signInWithGoogle: async () => {
    const supabase = getSupabase()
    if (!supabase) return
    set({ busy: true, message: null })
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    // Başarılıysa tarayıcı Google'a gider; buraya yalnızca hata dönerse ulaşılır.
    if (error) set({ busy: false, message: authMessage(error) })
  },

  signInWithPassword: async (email, password) => {
    const supabase = getSupabase()
    if (!supabase) return
    set({ busy: true, message: null })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    set({ busy: false, message: error ? authMessage(error) : null })
  },

  signUpWithPassword: async (email, password) => {
    const supabase = getSupabase()
    if (!supabase) return
    set({ busy: true, message: null })
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      set({ busy: false, message: authMessage(error) })
      return
    }
    // Oturum boşsa e-posta doğrulaması açık demektir; kullanıcı bunu bilmeli.
    set({
      busy: false,
      message: data.session
        ? null
        : 'Hesap açıldı. Gelen kutuna gönderilen doğrulama bağlantısına tıkla, sonra giriş yap.',
    })
  },

  signOut: async () => {
    const supabase = getSupabase()
    if (!supabase) return
    set({ busy: true })
    const { error } = await supabase.auth.signOut()
    set({
      busy: false,
      status: 'guest',
      userId: null,
      email: null,
      message: error ? authMessage(error) : null,
    })
  },

  setMessage: (message) => set({ message }),
}))
