import { useMemo, useState } from 'react'
import { toCamelot } from '../lib/camelot'
import { dedupeBySignature, localSearch } from '../lib/search'
import { getAccessToken } from '../store/supabase'
import { useStore } from '../store/store'
import { selectLibrary } from '../store/store'
import { Bpm, KeyChip } from './common'
import { Dialog } from './common'
import type { Track } from '../lib/types'

const SOURCE_LABEL: Record<Track['source'], string> = {
  library: 'kütüphane',
  catalog: 'keşif',
  web: 'internet',
  manual: 'elle',
}

interface WebResult {
  title?: unknown
  artist?: unknown
  bpm?: unknown
  key?: unknown
}

function readWebResults(body: unknown): { tracks: Track[]; message: string | null } {
  if (!body || typeof body !== 'object') {
    return { tracks: [], message: 'Sunucudan beklenmedik bir yanıt geldi. Biraz sonra tekrar dene.' }
  }
  const record = body as { results?: unknown; message?: unknown; configured?: unknown }
  const message = typeof record.message === 'string' ? record.message : null
  if (!Array.isArray(record.results)) return { tracks: [], message }

  const tracks: Track[] = []
  for (const item of record.results as WebResult[]) {
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    if (!title) continue
    const artist = typeof item.artist === 'string' ? item.artist.trim() : ''
    const bpm = typeof item.bpm === 'number' && Number.isFinite(item.bpm) ? item.bpm : null
    tracks.push({
      id: `web:${artist}:${title}`,
      title,
      artist,
      bpm,
      key: toCamelot(typeof item.key === 'string' ? item.key : null),
      source: 'web',
    })
  }
  return { tracks, message }
}

// Impure call has to stay outside render (react-hooks/purity).
function manualId(): string {
  return `manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
}

export interface TrackSearchDialogProps {
  open: boolean
  onClose: () => void
}

export function TrackSearchDialog({ open, onClose }: TrackSearchDialogProps) {
  const state = useStore()
  const [query, setQuery] = useState('')
  const [webTracks, setWebTracks] = useState<Track[]>([])
  const [webMessage, setWebMessage] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [manual, setManual] = useState({ title: '', artist: '', bpm: '', key: '' })
  const [manualOpen, setManualOpen] = useState(false)

  const local = useMemo(() => {
    const pool = dedupeBySignature([...selectLibrary(state), ...(state.catalog?.tracks ?? [])])
    return localSearch(query, pool, 40)
  }, [query, state])

  const results = [...local, ...webTracks]

  async function searchWeb() {
    setSearching(true)
    setWebMessage(null)
    try {
      const token = await getAccessToken()
      const response = await fetch(`/api/track-search?q=${encodeURIComponent(query)}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) {
        setWebTracks([])
        setWebMessage(
          `İnternet araması başarısız (HTTP ${response.status}). Vercel ayarlarındaki GETSONGBPM_API_KEY değerini kontrol et.`,
        )
        return
      }
      const parsed = readWebResults(await response.json())
      setWebTracks(parsed.tracks)
      setWebMessage(
        parsed.message ?? (parsed.tracks.length === 0 ? 'İnternette de bulunamadı.' : null),
      )
    } catch {
      setWebTracks([])
      setWebMessage('İnternete ulaşılamadı. Bağlantını kontrol et ya da parçayı elle gir.')
    } finally {
      setSearching(false)
    }
  }

  function add(track: Track) {
    state.addTrack(track)
    close()
  }

  function addManual() {
    const bpm = Number.parseFloat(manual.bpm)
    add({
      id: manualId(),
      title: manual.title.trim() || 'Adsız parça',
      artist: manual.artist.trim(),
      bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null,
      key: toCamelot(manual.key),
      source: 'manual',
    })
  }

  function close() {
    setQuery('')
    setWebTracks([])
    setWebMessage(null)
    setManual({ title: '', artist: '', bpm: '', key: '' })
    setManualOpen(false)
    onClose()
  }

  return (
    <Dialog open={open} title="Parça ara" onClose={close}>
      <div className="row">
        <input
          className="input"
          autoFocus
          placeholder="parça ya da sanatçı — Türkçe karakter yazmana gerek yok"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setWebTracks([])
            setWebMessage(null)
          }}
        />
        <button
          type="button"
          className="btn"
          onClick={() => void searchWeb()}
          disabled={searching || query.trim().length < 2}
        >
          {searching ? 'aranıyor…' : 'internette ara'}
        </button>
      </div>

      {query.trim().length === 0 ? (
        <p className="muted">
          Yazmaya başla: önce kütüphanen ve keşif katalogu süzülür, bulunamazsa internette
          arayabilirsin.
        </p>
      ) : null}

      {results.map((track, index) => (
        <div className="entry" key={`${track.id}-${index}`}>
          <span className="chip">{SOURCE_LABEL[track.source]}</span>
          <span className="entry-title">
            <strong>{track.title}</strong>
            <span className="muted"> — {track.artist}</span>
          </span>
          <KeyChip code={track.key} />
          <Bpm value={track.bpm} />
          <button type="button" className="btn btn-primary" onClick={() => add(track)}>
            ekle
          </button>
        </div>
      ))}

      {webMessage ? <p className="muted">{webMessage}</p> : null}

      {query.trim().length > 0 && results.length === 0 ? (
        <p className="muted">
          Bulunamadı. "internette ara" düğmesini dene, olmazsa aşağıdan elle gir.
        </p>
      ) : null}

      {query.trim().length > 0 ? (
        <button type="button" className="btn btn-ghost" onClick={() => setManualOpen(!manualOpen)}>
          {manualOpen ? 'elle girişi kapat' : 'elle gir'}
        </button>
      ) : null}

      {manualOpen ? (
        <div className="col">
          <input
            className="input"
            placeholder="parça adı"
            value={manual.title}
            onChange={(event) => setManual({ ...manual, title: event.target.value })}
          />
          <input
            className="input"
            placeholder="sanatçı"
            value={manual.artist}
            onChange={(event) => setManual({ ...manual, artist: event.target.value })}
          />
          <div className="row">
            <input
              className="input"
              placeholder="BPM (124)"
              value={manual.bpm}
              onChange={(event) => setManual({ ...manual, bpm: event.target.value })}
            />
            <input
              className="input"
              placeholder="key (8A, Am, 1m)"
              value={manual.key}
              onChange={(event) => setManual({ ...manual, key: event.target.value })}
            />
          </div>
          {manual.key.trim() && !toCamelot(manual.key) ? (
            <p className="error">
              Bu key okunamadı. Camelot (8A), nota (Am, F#m) ya da Open Key (1m) yazabilirsin.
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            onClick={addManual}
            disabled={!manual.title.trim()}
          >
            sete ekle
          </button>
        </div>
      ) : null}
    </Dialog>
  )
}
