import type { SupabaseClient } from '@supabase/supabase-js'
import { fromRows, toRows } from '../lib/state-rows'
import type { LibraryRow, SetlistRow, SettingsRow } from '../lib/state-rows'
import type { AppState } from '../lib/types'

export interface RemoteLoad {
  state: AppState | null
  error: string | null
}

export interface RemoteSave {
  ok: boolean
  conflict: boolean
  remote: AppState | null
  message: string | null
}

export interface RemoteStore {
  load: (userId: string) => Promise<RemoteLoad>
  save: (userId: string, state: AppState) => Promise<RemoteSave>
}

function failure(action: string, detail: string): string {
  return `Save failed while ${action}: ${detail}. Your changes are on this device; it will be retried when the connection is back.`
}

export function createSupabaseStore(client: SupabaseClient): RemoteStore {
  async function readRows(userId: string) {
    const [library, setlists, settings] = await Promise.all([
      client.from('libraries').select('*').eq('user_id', userId).maybeSingle(),
      client.from('setlists').select('*').eq('user_id', userId).order('position'),
      client.from('settings').select('*').eq('user_id', userId).maybeSingle(),
    ])
    return { library, setlists, settings }
  }

  async function load(userId: string): Promise<RemoteLoad> {
    try {
      const { library, setlists, settings } = await readRows(userId)
      const error = library.error ?? setlists.error ?? settings.error
      if (error) return { state: null, error: failure('reading', error.message) }

      const rows = {
        library: (library.data as LibraryRow | null) ?? null,
        setlists: (setlists.data as SetlistRow[] | null) ?? [],
        settings: (settings.data as SettingsRow | null) ?? null,
      }
      // No rows at all means this account has nothing yet; the caller should use the local copy.
      if (!rows.library && !rows.settings && rows.setlists.length === 0) {
        return { state: null, error: null }
      }
      return { state: fromRows(rows), error: null }
    } catch (problem) {
      return { state: null, error: failure('reading', message(problem)) }
    }
  }

  async function save(userId: string, state: AppState): Promise<RemoteSave> {
    try {
      const current = await client
        .from('settings')
        .select('saved_at')
        .eq('user_id', userId)
        .maybeSingle()

      const storedAt = (current.data as { saved_at?: number } | null)?.saved_at ?? 0
      // The stored record is newer: do not overwrite it, hand it back instead.
      if (storedAt > state.savedAt) {
        const remote = await load(userId)
        return {
          ok: false,
          conflict: true,
          remote: remote.state,
          message:
            'A newer record exists on another device; that record was loaded. Redo your change here and save again.',
        }
      }

      const rows = toRows(userId, state)

      const library = await client.from('libraries').upsert(rows.library)
      if (library.error) return written(library.error.message)

      const settings = await client.from('settings').upsert(rows.settings)
      if (settings.error) return written(settings.error.message)

      if (rows.setlists.length > 0) {
        const setlists = await client.from('setlists').upsert(rows.setlists)
        if (setlists.error) return written(setlists.error.message)
      }

      const existing = await client.from('setlists').select('id').eq('user_id', userId)
      if (existing.error) return written(existing.error.message)

      const keep = new Set(rows.setlists.map((row) => row.id))
      const remove = ((existing.data as { id: string }[] | null) ?? [])
        .map((row) => row.id)
        .filter((id) => !keep.has(id))

      if (remove.length > 0) {
        const deleted = await client.from('setlists').delete().eq('user_id', userId).in('id', remove)
        if (deleted.error) return written(deleted.error.message)
      }

      return { ok: true, conflict: false, remote: null, message: null }
    } catch (problem) {
      return written(message(problem))
    }
  }

  return { load, save }
}

function written(detail: string): RemoteSave {
  return { ok: false, conflict: false, remote: null, message: failure('writing', detail) }
}

function message(problem: unknown): string {
  return problem instanceof Error ? problem.message : String(problem)
}
