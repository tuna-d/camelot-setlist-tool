import { useMemo, useState } from 'react'
import { toCamelot } from '../lib/camelot'
import { readSearchResults, splitQuery } from '../lib/getsongbpm'
import { dedupeBySignature, localSearch } from '../lib/search'
import { getAccessToken } from '../store/supabase'
import { useStore } from '../store/store'
import { selectLibrary } from '../store/store'
import { Bpm, FavoriteButton, KeyChip } from './common'
import { Dialog } from './common'
import type { Track } from '../lib/types'

const SOURCE_LABEL: Record<Track['source'], string> = {
  library: 'library',
  catalog: 'discovery',
  web: 'web',
  manual: 'manual',
}

/** The function forwards the upstream answer untouched; parsing happens here. */
function readWebResults(body: unknown): { tracks: Track[]; message: string | null } {
  if (!body || typeof body !== 'object') {
    return { tracks: [], message: 'The server returned something unexpected. Try again shortly.' }
  }

  const record = body as { raw?: unknown; message?: unknown }
  const message = typeof record.message === 'string' ? record.message : null
  if (record.raw === null || record.raw === undefined) return { tracks: [], message }

  const parsed = readSearchResults(record.raw)
  const tracks: Track[] = parsed.results.map((hit) => ({
    id: `web:${hit.artist}:${hit.title}`,
    title: hit.title,
    artist: hit.artist,
    bpm: hit.bpm,
    key: hit.key,
    source: 'web' as const,
  }))

  return { tracks, message: message ?? parsed.message }
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
      // The key stays on the server; splitting and parsing live here so there is one copy.
      const { song, artist } = splitQuery(query)
      const address = `/api/track-search?song=${encodeURIComponent(song)}&artist=${encodeURIComponent(artist)}`
      const response = await fetch(address, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) {
        setWebTracks([])
        setWebMessage(
          `Web search failed (HTTP ${response.status}). Check the GETSONGBPM_API_KEY value in your Vercel settings.`,
        )
        return
      }
      const parsed = readWebResults(await response.json())
      setWebTracks(parsed.tracks)
      setWebMessage(
        parsed.message ?? (parsed.tracks.length === 0 ? 'Nothing on the web either.' : null),
      )
    } catch {
      setWebTracks([])
      setWebMessage('Could not reach the web. Check your connection, or enter the track by hand.')
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
      title: manual.title.trim() || 'Untitled track',
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
    <Dialog open={open} title="Find a track" onClose={close}>
      <div className="row">
        <input
          className="input"
          autoFocus
          placeholder="track or artist — accents and diacritics are optional"
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
          {searching ? 'searching…' : 'search the web'}
        </button>
      </div>

      {query.trim().length === 0 ? (
        <p className="muted">
          Start typing: your library and the discovery catalog are filtered first, and you can
          search the web if nothing matches.
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
          <FavoriteButton track={track} />
          <button type="button" className="btn btn-primary" onClick={() => add(track)}>
            add
          </button>
        </div>
      ))}

      {webMessage ? <p className="muted">{webMessage}</p> : null}

      {query.trim().length > 0 && results.length === 0 ? (
        <p className="muted">
          Nothing found. Try the "search the web" button, or enter it by hand below.
        </p>
      ) : null}

      {query.trim().length > 0 ? (
        <button type="button" className="btn btn-ghost" onClick={() => setManualOpen(!manualOpen)}>
          {manualOpen ? 'close manual entry' : 'enter by hand'}
        </button>
      ) : null}

      {manualOpen ? (
        <div className="col">
          <input
            className="input"
            placeholder="track title"
            value={manual.title}
            onChange={(event) => setManual({ ...manual, title: event.target.value })}
          />
          <input
            className="input"
            placeholder="artist"
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
              That key could not be read. Use Camelot (8A), a note (Am, F#m) or Open Key (1m).
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            onClick={addManual}
            disabled={!manual.title.trim()}
          >
            add to set
          </button>
        </div>
      ) : null}
    </Dialog>
  )
}
