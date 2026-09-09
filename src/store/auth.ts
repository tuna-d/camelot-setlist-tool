import { create } from 'zustand'
import { authMessage } from '../lib/auth-message'
import { getSupabase, isAuthConfigured } from './supabase'

export type AuthStatus = 'loading' | 'disabled' | 'guest' | 'signed-in'

export interface AuthState {
  status: AuthStatus
  userId: string | null
  email: string | null
  /** Error or information text shown to the user. */
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
    // On success the browser leaves for Google; we only get here on an error.
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
    // An empty session means email confirmation is on; the user needs to know.
    set({
      busy: false,
      message: data.session
        ? null
        : 'Account created. Click the confirmation link in your inbox, then sign in.',
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
