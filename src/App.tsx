import { useEffect, useRef, useState } from 'react'
import { isCatalog } from './lib/catalog'
import type { AppState, Catalog } from './lib/types'
import { selectLibrary, useStore } from './store/store'
import type { StoreState, SyncStatus } from './store/store'
import { bootstrap, createSaver } from './store/sync'
import { AutoBuildDialog } from './components/AutoBuildDialog'
import { ImportDialog } from './components/ImportDialog'
import { SetlistPanel } from './components/SetlistPanel'
import { SuggestPanel } from './components/SuggestPanel'
import { TrackSearchDialog } from './components/TrackSearchDialog'

type OpenDialog = 'import' | 'search' | 'auto' | null

const SYNC_LABEL: Record<SyncStatus, string> = {
  idle: 'hazır',
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
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const ready = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function boot() {
      const store = useStore.getState()
      const result = await bootstrap(fetch)
      if (cancelled) return
      if (result.state) store.hydrate(result.state as AppState)
      store.setSync(result.sync)

      const catalog = await loadCatalog()
      if (cancelled) return
      if (catalog) store.setCatalog(catalog)
      ready.current = true
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const saver = createSaver({
      fetchImpl: fetch,
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
  }, [])

  const visible = selectLibrary(state)
  const usable = visible.filter((track) => track.bpm !== null && track.key !== null).length

  return (
    <div className="app">
      <header className="topbar">
        <h1>Camelot Setlist</h1>

        <span className="faint">
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
      </header>

      {state.sync.message ? <p className="topbar-message muted">{state.sync.message}</p> : null}

      <main className="layout">
        <SetlistPanel
          onOpenSearch={() => setDialog('search')}
          onOpenAutoBuild={() => setDialog('auto')}
        />
        <SuggestPanel />
      </main>

      <ImportDialog open={dialog === 'import'} onClose={() => setDialog(null)} />
      <TrackSearchDialog open={dialog === 'search'} onClose={() => setDialog(null)} />
      <AutoBuildDialog open={dialog === 'auto'} onClose={() => setDialog(null)} />
    </div>
  )
}
