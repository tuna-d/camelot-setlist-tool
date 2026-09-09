import { useEffect, useRef, useState } from 'react'
import { isCatalog } from './lib/catalog'
import type { AppState, Catalog } from './lib/types'
import { selectLibrary, useStore } from './store/store'
import type { StoreState, SyncStatus } from './store/store'
import { useAuth } from './store/auth'
import { createSupabaseStore } from './store/remote'
import { getSupabase } from './store/supabase'
import { bootstrapGuest, bootstrapUser, createSaver } from './store/sync'
import { AuthDialog } from './components/AuthDialog'
import { AutoBuildDialog } from './components/AutoBuildDialog'
import { ImportDialog } from './components/ImportDialog'
import { SetlistMenu } from './components/SetlistMenu'
import { SetlistPanel } from './components/SetlistPanel'
import { SetSummaryPanel } from './components/SetSummaryPanel'
import { SuggestPanel } from './components/SuggestPanel'
import { TrackSearchDialog } from './components/TrackSearchDialog'

type OpenDialog = 'import' | 'search' | 'auto' | 'auth' | null

const SYNC_LABEL: Record<SyncStatus, string> = {
  idle: 'hazır',
  local: 'yalnızca bu tarayıcı',
  saving: 'kaydediliyor…',
  saved: 'kaydedildi',
  offline: 'yalnızca bu cihaz',
  conflict: 'çakışma',
  error: 'hata',
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

// Kalıcı alanların referansları: `sync` ve `catalog` değişince kayıt tetiklenmesin,
// yoksa kaydetme durum güncellemesi kendini tetikleyip döngüye girer.
function snapshot(state: StoreState): unknown[] {
  return [
    state.library,
    state.extras,
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
      store.setSync(result.sync)
      setPendingGuest(result.pendingGuest)

      const catalog = await loadCatalog()
      if (cancelled) return
      if (catalog) store.setCatalog(catalog)
      ready.current = true
    }

    // Oturum belli olmadan yükleme yapma: misafir kaydını hesabın üstüne yazma riski var.
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
    useStore.getState().hydrate({ ...pendingGuest, savedAt: Date.now() })
    setPendingGuest(null)
    useStore.getState().setSync({ status: 'saving', message: null })
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

        <span className="chip chip-static lib-stats">
          {state.library.length === 0
            ? 'kütüphane yok — rekordbox XML’ini içe aktar'
            : `${visible.length} parça · ${usable} kullanılabilir · ${state.playlists.length} playlist`}
        </span>

        {state.playlists.length > 0 ? (
          <select
            className="select topbar-select"
            value={state.playlistId ?? ''}
            onChange={(event) => state.selectPlaylist(event.target.value || null)}
          >
            <option value="">tüm koleksiyon</option>
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
          title={state.sync.message ?? 'Değişiklikler bu cihazda ve sunucuda saklanıyor.'}
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
              çıkış
            </button>
          </span>
        ) : auth.status === 'disabled' ? null : (
          <button type="button" className="btn" onClick={() => setDialog('auth')}>
            giriş yap
          </button>
        )}
      </header>

      {auth.status === 'guest' ? (
        <p className="banner">
          Misafir olarak çalışıyorsun: setlerin sunucuya kaydedilmiyor, yalnızca bu tarayıcıda
          duruyor. Başka bir cihazda açmak için{' '}
          <button type="button" className="btn btn-ghost" onClick={() => setDialog('auth')}>
            giriş yap
          </button>
          .
        </p>
      ) : auth.status === 'disabled' ? (
        <p className="banner">
          Giriş bu kurulumda kapalı: setlerin yalnızca bu tarayıcıda duruyor.
        </p>
      ) : null}

      {pendingGuest ? (
        <p className="banner">
          Misafirken kurduğun çalışma bu tarayıcıda duruyor. Hesabındaki kaydın üzerine yazılmadı.
          <button type="button" className="btn" onClick={adoptGuestWork}>
            hesabıma taşı
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setPendingGuest(null)}>
            yoksay
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
    </div>
  )
}
