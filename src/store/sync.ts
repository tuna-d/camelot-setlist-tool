import { isAppState } from '../lib/state'
import type { AppState } from '../lib/types'
import type { RemoteStore } from './remote'
import type { SyncState } from './store'

export const STORAGE_KEY = 'camelot-setlist:v1'
/** The state before an irreversible merge; kept only for rescue. */
export const BACKUP_KEY = 'camelot-setlist:backup'
export const SAVE_DELAY = 2500

export { isAppState }

export function pickNewer(local: AppState | null, remote: AppState | null): AppState | null {
  if (!local) return remote
  if (!remote) return local
  return remote.savedAt > local.savedAt ? remote : local
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function readLocal(): AppState | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isAppState(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeLocal(state: AppState): boolean {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function clearLocal(): void {
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch {
    // Storage access itself throws when site data is blocked.
  }
}

export function writeBackup(state: AppState): boolean {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(BACKUP_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function readBackup(): AppState | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(BACKUP_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isAppState(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Is there guest work worth moving into the account? */
export function hasContent(state: AppState | null): boolean {
  if (!state) return false
  return state.setlists.some((setlist) => setlist.entries.length > 0) || state.library.length > 0
}

export interface BootstrapResult {
  state: AppState | null
  sync: SyncState
  /** Guest work waiting to be moved into the account after sign-in. */
  pendingGuest: AppState | null
}

export function bootstrapGuest(): BootstrapResult {
  const local = readLocal()
  return {
    state: local,
    sync: {
      status: 'local',
      message: null,
      savedAt: local?.savedAt ?? null,
    },
    pendingGuest: null,
  }
}

/**
 * Signed-in bootstrap. The account record always wins; guest work is never
 * silently written over it, it is kept aside to be moved.
 */
export async function bootstrapUser(store: RemoteStore, userId: string): Promise<BootstrapResult> {
  const local = readLocal()
  const remote = await store.load(userId)

  if (remote.error) {
    return {
      state: local,
      sync: { status: 'offline', message: remote.error, savedAt: local?.savedAt ?? null },
      pendingGuest: null,
    }
  }

  if (!remote.state) {
    return {
      state: local,
      sync: {
        status: 'idle',
        message: local ? 'The work on this device will be saved to your account.' : null,
        savedAt: local?.savedAt ?? null,
      },
      pendingGuest: null,
    }
  }

  const guest = hasContent(local) && local !== null ? local : null
  return {
    state: remote.state,
    sync: {
      status: 'idle',
      message: guest ? 'Your account record was loaded. You can move the set you built as a guest.' : null,
      savedAt: remote.state.savedAt,
    },
    pendingGuest: guest,
  }
}

export interface SaverOptions {
  /** `null` when signed out: the record stays in the browser only. */
  store: RemoteStore | null
  userId: string | null
  onConflict: (state: AppState) => void
  onSync: (sync: Partial<SyncState>) => void
  delay?: number
}

export interface Saver {
  save: (state: AppState) => void
  flush: () => Promise<void>
  cancel: () => void
}

export function createSaver(options: SaverOptions): Saver {
  const delay = options.delay ?? SAVE_DELAY
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: AppState | null = null

  async function push(): Promise<void> {
    const state = pending
    pending = null
    if (!state) return

    const { store, userId } = options
    if (!store || !userId) {
      options.onSync({ status: 'local', message: null, savedAt: state.savedAt })
      return
    }

    options.onSync({ status: 'saving', message: null })
    const result = await store.save(userId, state)

    if (result.conflict && result.remote) {
      writeLocal(result.remote)
      options.onConflict(result.remote)
      options.onSync({ status: 'conflict', message: result.message, savedAt: result.remote.savedAt })
      return
    }

    if (!result.ok) {
      options.onSync({ status: 'offline', message: result.message, savedAt: state.savedAt })
      return
    }

    options.onSync({ status: 'saved', message: null, savedAt: state.savedAt })
  }

  return {
    save(state) {
      writeLocal(state)
      pending = state
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void push()
      }, delay)
    },
    async flush() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      await push()
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
      pending = null
    },
  }
}
