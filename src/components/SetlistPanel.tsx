import { useMemo, useState } from 'react'
import { relation, relationInfo } from '../lib/camelot'
import { toM3u8 } from '../lib/rekordbox'
import { bpmDelta, formatDelta } from '../lib/suggest'
import { formatDuration, formatTotal, toneColor } from '../lib/ui'
import {
  selectActive,
  selectEntries,
  useStore,
} from '../store/store'
import { Bpm, KeyChip, TrackLinks, youtubeSearchUrl } from './common'
import { TempoCurve } from './TempoCurve'
import type { Track } from '../lib/types'

const MAX_YOUTUBE_TABS = 8

function setlistText(tracks: Track[]): string {
  return tracks
    .map((track, index) => {
      const bpm = track.bpm === null ? '—' : track.bpm
      return `${index + 1}. ${track.artist} - ${track.title} · ${bpm} BPM · ${track.key ?? '—'}`
    })
    .join('\n')
}

function TransitionBridge({ from, to, tolerance }: { from: Track; to: Track; tolerance: number }) {
  const id = relation(from.key, to.key)
  const info = id ? relationInfo(id) : null
  const delta = from.bpm !== null && to.bpm !== null ? bpmDelta(from.bpm, to.bpm) : null
  const limit = from.bpm !== null ? (from.bpm * tolerance) / 100 : 0
  const tempoOk = delta === null ? false : delta.abs <= limit
  const ok = Boolean(info) && tempoOk

  const color = ok && info ? toneColor(info.tone) : 'var(--danger)'
  const label = info ? info.label : 'Uyumsuz key'
  const tempoText = delta === null ? 'tempo bilinmiyor' : `${formatDelta(delta)} BPM`
  const warning = !info
    ? 'Bu iki key arasında tanımlı bir geçiş yok — araya uyumlu bir parça koy.'
    : !tempoOk
      ? `Tempo farkı toleransın (%${tolerance}) dışında — pitch'i zorlar.`
      : (info.hint ?? '')

  return (
    <div className="bridge" style={{ borderColor: color }} title={warning}>
      <span className="bridge-line" style={{ background: color }} />
      <span style={{ color }}>{label}</span>
      <span className="mono faint">{tempoText}</span>
      {delta?.halved ? <span className="faint">yarım/çift tempo</span> : null}
      {!ok ? <span style={{ color: 'var(--danger)' }}>⚠ {warning}</span> : null}
    </div>
  )
}

export interface SetlistPanelProps {
  onOpenSearch?: () => void
  onOpenAutoBuild?: () => void
}

export function SetlistPanel({ onOpenSearch, onOpenAutoBuild }: SetlistPanelProps) {
  // Whole-state subscription on purpose: derived lists would break per-selector caching.
  const state = useStore()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const active = selectActive(state)
  const tracks = useMemo(() => selectEntries(state), [state])
  const totalSeconds = tracks.reduce((total, track) => total + (track.duration ?? 360), 0)

  function handleDrop(target: number) {
    if (dragIndex !== null && dragIndex !== target) state.moveEntry(dragIndex, target)
    setDragIndex(null)
  }

  async function copyToClipboard() {
    const text = setlistText(tracks)
    try {
      await navigator.clipboard.writeText(text)
      setNotice('Setlist panoya kopyalandı.')
    } catch {
      setNotice('Pano izni yok. Metni seçip elle kopyalaman gerekiyor.')
    }
  }

  function openOnYoutube() {
    const opened = tracks.slice(0, MAX_YOUTUBE_TABS)
    for (const track of opened) window.open(youtubeSearchUrl(track), '_blank', 'noopener')
    setNotice(
      tracks.length > MAX_YOUTUBE_TABS
        ? `İlk ${MAX_YOUTUBE_TABS} parça açıldı. Tarayıcı daha fazlasını engelliyor; kalanları listeden tek tek aç. Sekme açılmadıysa açılır pencere iznini ver.`
        : 'Sekmeler açıldı. Açılmadıysa tarayıcının açılır pencere iznini ver.',
    )
  }

  function downloadM3u8() {
    const withPath = tracks.filter((track) => track.location)
    if (withPath.length === 0) {
      setNotice(
        'Sette dosya yolu olan parça yok. m3u8 yalnızca rekordbox kütüphanenden gelen parçaları yazabilir.',
      )
      return
    }
    const blob = new Blob([toM3u8(tracks, active.name)], { type: 'audio/x-mpegurl' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${active.name}.m3u8`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice(`${withPath.length} parça m3u8 olarak indirildi.`)
  }

  function clearAll() {
    if (tracks.length === 0) return
    if (window.confirm(`"${active.name}" setindeki ${tracks.length} parça silinsin mi?`)) {
      state.clearSetlist()
    }
  }

  return (
    <section className="panel col" aria-label="Setlist">
      <div className="row-wrap">
        {state.setlists.map((setlist) => (
          <button
            key={setlist.id}
            type="button"
            className="chip"
            aria-pressed={setlist.id === state.activeId}
            onClick={() => state.selectSetlist(setlist.id)}
            onDoubleClick={() => {
              const name = window.prompt('Setlist adı', setlist.name)
              if (name !== null) state.renameSetlist(setlist.id, name)
            }}
            title="Çift tıkla: yeniden adlandır"
          >
            {setlist.name} · {setlist.entries.length}
          </button>
        ))}
        <button type="button" className="btn btn-ghost" onClick={() => state.newSetlist()}>
          + yeni set
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-ghost btn-danger"
          onClick={() => state.removeSetlist(active.id)}
          title="Bu setlisti sil"
        >
          seti sil
        </button>
      </div>

      <div className="row-wrap">
        <h2>{active.name}</h2>
        <span className="faint">
          {tracks.length} parça · {formatTotal(totalSeconds)}
        </span>
        <span className="spacer" />
        {onOpenSearch ? (
          <button type="button" className="btn" onClick={onOpenSearch}>
            parça ara
          </button>
        ) : null}
        {onOpenAutoBuild ? (
          <button type="button" className="btn" onClick={onOpenAutoBuild}>
            otomatik kur
          </button>
        ) : null}
      </div>

      {tracks.length === 0 ? (
        <p className="muted">
          Set boş. "parça ara" ile bir başlangıç parçası ekle, sonra sağdaki önerilerden devam et.
        </p>
      ) : (
        <ol className="entries">
          {tracks.map((track, index) => (
            <li key={`${track.id}-${index}`}>
              {index > 0 ? (
                <TransitionBridge from={tracks[index - 1]} to={track} tolerance={state.tolerance} />
              ) : null}

              <div
                className="entry"
                draggable
                aria-current={index === state.cursor}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(index)}
                onClick={() => state.setCursor(index)}
              >
                <span className="mono faint entry-index">{index + 1}</span>
                <span className="entry-title">
                  <strong>{track.title}</strong>
                  <span className="muted"> — {track.artist}</span>
                </span>
                <KeyChip code={track.key} />
                <Bpm value={track.bpm} />
                <span className="mono faint">{formatDuration(track.duration)}</span>
                <TrackLinks track={track} />
                <button
                  type="button"
                  className="btn btn-ghost btn-danger"
                  onClick={(event) => {
                    event.stopPropagation()
                    state.removeEntry(index)
                  }}
                  aria-label={`${track.title} parçasını setten çıkar`}
                >
                  ✕
                </button>
              </div>

              <input
                className="input entry-note"
                placeholder="parça notu"
                value={active.entries[index]?.note ?? ''}
                onChange={(event) => state.setEntryNote(index, event.target.value)}
              />
            </li>
          ))}
        </ol>
      )}

      {tracks.length > 1 ? (
        <TempoCurve
          points={tracks.map((track) => ({
            bpm: track.bpm,
            key: track.key,
            label: `${track.artist} - ${track.title}`,
          }))}
        />
      ) : null}

      <div className="row-wrap">
        <button type="button" className="btn" onClick={() => void copyToClipboard()}>
          kopyala
        </button>
        <button type="button" className="btn" onClick={openOnYoutube} disabled={tracks.length === 0}>
          YouTube'da aç
        </button>
        <button type="button" className="btn" onClick={downloadM3u8} disabled={tracks.length === 0}>
          .m3u8
        </button>
        <button type="button" className="btn btn-danger" onClick={clearAll}>
          temizle
        </button>
      </div>

      {notice ? <p className="muted">{notice}</p> : null}

      <textarea
        className="textarea"
        placeholder="set notu — nerede çalınacak, hangi saat, ne hissettirmeli"
        value={active.note ?? ''}
        onChange={(event) => state.setSetlistNote(event.target.value)}
      />
    </section>
  )
}
