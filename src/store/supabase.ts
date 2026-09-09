import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null | undefined

// Env eksikse istemci hiç kurulmaz: uygulama misafir kipinde çalışmaya devam eder.
export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  cached = url && key ? createClient(url, key) : null
  return cached
}

export function isAuthConfigured(): boolean {
  return getSupabase() !== null
}

export function setSupabaseForTests(client: SupabaseClient | null): void {
  cached = client
}
