/**
 * İki katmanlı kalıcılık.
 *
 * 1. `localStorage` — her zaman ve anında; sunucu olmasa da çalışsın.
 * 2. `/api/state` — varsa cihazlar arası.
 *
 * Açılışta iki kaydın `savedAt` damgası karşılaştırılır, yeni olan kazanır.
 * Yazarken sunucu daha yeni bir kayıt tutuyorsa `409` döner: o kayıt alınır ve
 * kullanıcıya haber verilir. Sessizce üzerine yazmak, telefonda kurulan seti
 * masaüstündeki eski sekmenin silmesi demek olurdu.
 */

import type { AppState } from '../lib/types'
import type { SyncState } from './store'

export const STORAGE_KEY = 'camelot-setlist:v1'
/** Yazma gecikmesi: her tuş vuruşunda sunucuya gitmeyelim. */
export const SAVE_DELAY = 2500
const STATE_ENDPOINT = '/api/state'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

function appSecret(): string {
  return import.meta.env.VITE_APP_SECRET ?? ''
}

function headers(): Record<string, string> {
  const secret = appSecret()
  return secret
    ? { 'content-type': 'application/json', 'x-app-secret': secret }
    : { 'content-type': 'application/json' }
}

/** Dışarıdan gelen her veri şüphelidir: en azından iskeletini doğrula. */
export function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    Array.isArray(record.setlists) &&
    Array.isArray(record.library) &&
    typeof record.savedAt === 'number'
  )
}

/** İki kayıttan damgası yeni olanı seçer; eşitlikte yereli tutar. */
export function pickNewer(local: AppState | null, remote: AppState | null): AppState | null {
  if (!local) return remote
  if (!remote) return local
  return remote.savedAt > local.savedAt ? remote : local
}

function storage(): Storage | null {
  try {
    // Gizli sekmede ve depolama kapalıyken erişimin kendisi hata atabiliyor.
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
    // Bozuk kayıt: yok saymak, açılışta çökmekten iyi.
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
    // Silinemiyorsa yapacak bir şey yok; çağıran taraf zaten yeni kaydı yazacak.
  }
}

export interface RemoteRead {
  state: AppState | null
  /** Sunucuya ulaşılamadıysa ne olduğunu anlatan metin. */
  error: string | null
}

/** Sunucudaki kaydı okur. Sunucu yoksa hata değil, `state: null` döner. */
export async function readRemote(fetchImpl: FetchLike): Promise<RemoteRead> {
  try {
    const response = await fetchImpl(STATE_ENDPOINT, { headers: headers() })
    if (response.status === 404 || response.status === 204) return { state: null, error: null }
    if (!response.ok) {
      return {
        state: null,
        error: `Sunucudaki kayıt okunamadı (HTTP ${response.status}). Şimdilik yalnızca bu cihazda kayıtlısın; Vercel ortam değişkenlerini kontrol et.`,
      }
    }
    const body: unknown = await response.json()
    return { state: isAppState(body) ? body : null, error: null }
  } catch {
    return {
      state: null,
      error: 'Sunucuya ulaşılamadı. Çalışmaya devam edebilirsin, kayıt bu cihazda tutuluyor.',
    }
  }
}

export interface RemoteWrite {
  ok: boolean
  /** Sunucu daha yeni bir kayıt tutuyorsa `true` ve `remote` dolu gelir. */
  conflict: boolean
  remote: AppState | null
  message: string | null
}

/** Sunucuya yazar. `409` gelirse sunucudaki kayıt geri döner, üzerine yazılmaz. */
export async function writeRemote(state: AppState, fetchImpl: FetchLike): Promise<RemoteWrite> {
  try {
    const response = await fetchImpl(STATE_ENDPOINT, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(state),
    })

    if (response.status === 409) {
      const body: unknown = await response.json()
      return {
        ok: false,
        conflict: true,
        remote: isAppState(body) ? body : null,
        message:
          'Başka bir cihazda daha yeni bir kayıt var; o kayıt yüklendi. Buradaki değişikliği tekrar yap ve kaydet.',
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        conflict: false,
        remote: null,
        message: `Sunucuya yazılamadı (HTTP ${response.status}). Değişikliklerin bu cihazda duruyor; bağlantı düzelince tekrar dene.`,
      }
    }

    return { ok: true, conflict: false, remote: null, message: null }
  } catch {
    return {
      ok: false,
      conflict: false,
      remote: null,
      message: 'Sunucuya ulaşılamadı. Değişikliklerin bu cihazda duruyor.',
    }
  }
}

export interface BootstrapResult {
  state: AppState | null
  sync: SyncState
}

/**
 * Açılışta yerel ve uzak kayıtları karşılaştırıp yenisini seçer.
 * Uzak kayıt daha yeniyse kullanıcıya söylenir — sessizce değişen bir ekran,
 * kullanıcının kendi setini kaybettiğini sanmasına yol açıyor.
 */
export async function bootstrap(fetchImpl: FetchLike): Promise<BootstrapResult> {
  const local = readLocal()
  const remote = await readRemote(fetchImpl)
  const winner = pickNewer(local, remote.state)

  if (remote.error) {
    return { state: winner, sync: { status: 'offline', message: remote.error, savedAt: winner?.savedAt ?? null } }
  }

  const fromRemote = Boolean(remote.state && winner === remote.state && local)
  return {
    state: winner,
    sync: {
      status: 'idle',
      message: fromRemote ? 'Başka bir cihazdaki daha yeni kayıt yüklendi.' : null,
      savedAt: winner?.savedAt ?? null,
    },
  }
}

export interface SaverOptions {
  fetchImpl: FetchLike
  /** Sunucudaki kayıt daha yeniyse çağrılır; mağaza bu kayda geçmeli. */
  onConflict: (state: AppState) => void
  onSync: (sync: Partial<SyncState>) => void
  delay?: number
}

export interface Saver {
  /** Yerele hemen yazar, sunucuya yazmayı geciktirir. */
  save: (state: AppState) => void
  /** Bekleyen yazmayı hemen yapar. */
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

    options.onSync({ status: 'saving', message: null })
    const result = await writeRemote(state, options.fetchImpl)

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
