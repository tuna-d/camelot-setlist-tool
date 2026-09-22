import { useEffect, useRef, useState } from 'react'
import { isCatalog } from './lib/catalog'
import { mergeGuestWork } from './lib/merge'
import type { AppState, Catalog } from './lib/types'
import { selectLibrary, useStore } from './store/store'
import type { StoreState, SyncStatus } from './store/store'
import { useAuth } from './store/auth'
import { createSupabaseStore } from './store/remote'
import { getSupabase } from './store/supabase'
import { bootstrapGuest, bootstrapUser, createSaver, writeBackup } from './store/sync'
import { AuthDialog } from './components/AuthDialog'
import { AutoBuildDialog } from './components/AutoBuildDialog'
import { HeartIcon } from './components/common'
import { FavoritesDialog } from './components/FavoritesDialog'
import { ImportDialog } from './components/ImportDialog'
import { SetlistMenu } from './components/SetlistMenu'
import { SetlistPanel } from './components/SetlistPanel'
import { SetSummaryPanel } from './components/SetSummaryPanel'
import { SuggestPanel } from './components/SuggestPanel'
import { TrackSearchDialog } from './components/TrackSearchDialog'

type OpenDialog = 'import' | 'search' | 'auto' | 'auth' | 'favorites' | null

const SYNC_LABEL: Record<SyncStatus, string> = {
  idle: 'ready',
  local: 'this browser only',
  saving: 'saving…',
  saved: 'saved',
  offline: 'this device only',
  conflict: 'conflict',
  error: 'error',
}

async function loadCatalog(): Promise<Catalog | null> {
  for (const url of ['/api/catalog', '/catalog.json']) {
    try {
      const response = await fetch(url)
      if (!response.ok) continue
      const body: unknown = await response.json()
      if (isCatalog(body)) return body
    } catch {
      // Adres yoksa bir sonrakini dene.
    }
  }
  return null
}

// Reference list of the persisted fields: `sync` and `catalog` must not trigger a save,
// otherwise the save status update would feed itself into a loop.
function snapshot(state: StoreState): unknown[] {
  return [
    state.library,
    state.extras,
    state.favorites,
    state.playlists,
    state.playlistId,
    state.setlists,
    state.activeId,
    state.cursor,
    state.tolerance,
    state.relations,
    state.genres,
    state.poolSource,
  ]
}

function same(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export function App() {
  const state = useStore()
  const auth = useAuth()
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [pendingGuest, setPendingGuest] = useState<AppState | null>(null)
  const ready = useRef(false)

  useEffect(() => useAuth.getState().init(), [])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      const store = useStore.getState()
      const client = getSupabase()
      const remote = client && auth.userId ? createSupabaseStore(client) : null

      const result =
        remote && auth.userId ? await bootstrapUser(remote, auth.userId) : bootstrapGuest()
      if (cancelled) return

      if (result.state) store.hydrate(result.state as AppState)
      // Suggestions follow the cursor, and a set is continued from its end.
      store.focusSetEnd()
      store.setSync(result.sync)
      setPendingGuest(result.pendingGuest)

      const catalog = await loadCatalog()
      if (cancelled) return
      if (catalog) store.setCatalog(catalog)
      ready.current = true
    }

    // Do not load before the session is known: guest work could overwrite the account.
    if (auth.status === 'loading') return
    ready.current = false
    void boot()
    return () => {
      cancelled = true
    }
  }, [auth.status, auth.userId])

  useEffect(() => {
    const client = getSupabase()
    const saver = createSaver({
      store: client && auth.userId ? createSupabaseStore(client) : null,
      userId: auth.userId,
      onConflict: (incoming) => useStore.getState().hydrate(incoming),
      onSync: (sync) => useStore.getState().setSync(sync),
    })

    let previous = snapshot(useStore.getState())
    const unsubscribe = useStore.subscribe((next) => {
      const current = snapshot(next)
      if (same(previous, current)) return
      previous = current
      if (!ready.current) return
      saver.save(next.exportState())
    })

    return () => {
      unsubscribe()
      saver.cancel()
    }
  }, [auth.userId])

  function adoptGuestWork() {
    if (!pendingGuest) return
    const store = useStore.getState()
    // The merge cannot be undone: write the previous state to the rescue key.
    writeBackup(store.exportState())
    // Never write over the account's sets: guest work is added next to them.
    store.hydrate(mergeGuestWork(store.exportState(), pendingGuest))
    setPendingGuest(null)
    store.setSync({ status: 'saving', message: null })
  }

  const visible = selectLibrary(state)
  const usable = visible.filter((track) => track.bpm !== null && track.key !== null).length

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="brand-dot" aria-hidden="true" />
          <h1>Camelot Setlist</h1>
        </span>

        <SetlistMenu />

        <button
          type="button"
          className="btn fav-nav"
          onClick={() => setDialog('favorites')}
          title="Tracks you marked with the heart"
        >
          <HeartIcon filled={state.favorites.length > 0} />
          favorites
          <span className="fav-count">{state.favorites.length}</span>
        </button>

        <span className="chip chip-static lib-stats">
          {state.library.length === 0
            ? 'no library — import your rekordbox XML'
            : `${visible.length} tracks · ${usable} usable · ${state.playlists.length} playlists`}
        </span>

        {state.playlists.length > 0 ? (
          <select
            className="select topbar-select"
            value={state.playlistId ?? ''}
            onChange={(event) => state.selectPlaylist(event.target.value || null)}
          >
            <option value="">whole collection</option>
            {state.playlists.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name} ({playlist.trackIds.length})
              </option>
            ))}
          </select>
        ) : null}

        <span className="spacer" />
        <span
          className={`chip sync sync-${state.sync.status}`}
          title={state.sync.message ?? 'Changes are kept on this device and on the server.'}
        >
          {SYNC_LABEL[state.sync.status]}
        </span>

        <button type="button" className="btn" onClick={() => setDialog('import')}>
          rekordbox XML
        </button>

        {auth.status === 'signed-in' ? (
          <span className="row">
            <span className="faint">{auth.email}</span>
            <button type="button" className="btn btn-ghost" onClick={() => void auth.signOut()}>
              sign out
            </button>
          </span>
        ) : auth.status === 'disabled' ? null : (
          <button type="button" className="btn" onClick={() => setDialog('auth')}>
            sign in
          </button>
        )}
      </header>

      {auth.status === 'guest' ? (
        <p className="banner">
          You are working as a guest: your sets are not saved to the server, they stay in this
          browser only. To open them on another device,{' '}
          <button type="button" className="btn btn-ghost" onClick={() => setDialog('auth')}>
            sign in
          </button>
          .
        </p>
      ) : auth.status === 'disabled' ? (
        <p className="banner">
          Sign-in is off in this setup: your sets stay in this browser only.
        </p>
      ) : null}

      {pendingGuest ? (
        <p className="banner">
          The work you did as a guest is still in this browser. Your account record was not overwritten.
          <button type="button" className="btn" onClick={adoptGuestWork}>
            move into my account
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setPendingGuest(null)}>
            ignore
          </button>
        </p>
      ) : null}

      {state.sync.message ? <p className="topbar-message muted">{state.sync.message}</p> : null}

      <main className="layout">
        <SetlistPanel
          onOpenSearch={() => setDialog('search')}
          onOpenAutoBuild={() => setDialog('auto')}
        />
        <SetSummaryPanel />
        <SuggestPanel />
      </main>

      <AuthDialog open={dialog === 'auth'} onClose={() => setDialog(null)} />
      <ImportDialog open={dialog === 'import'} onClose={() => setDialog(null)} />
      <TrackSearchDialog open={dialog === 'search'} onClose={() => setDialog(null)} />
      <AutoBuildDialog open={dialog === 'auto'} onClose={() => setDialog(null)} />
      <FavoritesDialog open={dialog === 'favorites'} onClose={() => setDialog(null)} />
    </div>
  )
}
