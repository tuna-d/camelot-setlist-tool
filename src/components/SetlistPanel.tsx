import { useMemo, useState } from 'react'
import { relationInfo } from '../lib/camelot'
import { transition } from '../lib/setstats'
import { formatDelta } from '../lib/suggest'
import { formatDuration, formatTotal, toneColor } from '../lib/ui'
import { selectActive, selectEntries, useStore } from '../store/store'
import { Bpm, KeyChip, TrackLinks } from './common'
import type { Track } from '../lib/types'

function TransitionBridge({ from, to, tolerance }: { from: Track; to: Track; tolerance: number }) {
  const step = transition(from, to, tolerance)
  const info = step.relation ? relationInfo(step.relation) : null

  const color = step.ok && info ? toneColor(info.tone) : 'var(--danger)'
  const label = info ? info.label : 'Uyumsuz key'
  const tempoText = step.delta === null ? 'tempo bilinmiyor' : `${formatDelta(step.delta)} BPM`
  const warning = !info
    ? 'Bu iki key arasında tanımlı bir geçiş yok — araya uyumlu bir parça koy.'
    : !step.tempoOk
      ? `Tempo farkı toleransın (%${tolerance}) dışında — pitch'i zorlar.`
      : (info.hint ?? '')

  return (
    <div className="bridge" style={{ borderColor: color }} title={warning}>
      <span className="bridge-line" style={{ background: color }} />
      <span style={{ color }}>{label}</span>
      <span className="mono faint">{tempoText}</span>
      {step.delta?.halved ? <span className="faint">yarım/çift tempo</span> : null}
      {!step.ok ? <span style={{ color: 'var(--danger)' }}>⚠ {warning}</span> : null}
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

  const active = selectActive(state)
  const tracks = useMemo(() => selectEntries(state), [state])
  const totalSeconds = tracks.reduce((total, track) => total + (track.duration ?? 360), 0)

  function handleDrop(target: number) {
    if (dragIndex !== null && dragIndex !== target) state.moveEntry(dragIndex, target)
    setDragIndex(null)
  }

  return (
    <section className="panel col" aria-label="Setlist">
      <div className="row-wrap">
        <h2>{active.name}</h2>
        <span className="chip chip-static">
          {tracks.length} parça · {formatTotal(totalSeconds)}
        </span>
        <span className="spacer" />
        {onOpenSearch ? (
          <button type="button" className="btn" onClick={onOpenSearch}>
            parça ara
          </button>
        ) : null}
        {onOpenAutoBuild ? (
          <button type="button" className="btn btn-primary" onClick={onOpenAutoBuild}>
            otomatik kur
          </button>
        ) : null}
      </div>

      {tracks.length === 0 ? (
        <p className="muted">
          Set boş. "parça ara" ile bir başlangıç parçası ekle, sonra aşağıdaki önerilerden devam et.
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
                <span className="mono entry-index">{index + 1}</span>
                <span className="entry-title">
                  <strong>{track.title}</strong>
                  <span className="muted"> — {track.artist}</span>
                </span>
                <span className="entry-meta">
                  <KeyChip code={track.key} />
                  <Bpm value={track.bpm} />
                  <span className="mono faint">{formatDuration(track.duration)}</span>
                  <TrackLinks track={track} />
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-danger"
                    onClick={(event) => {
                      event.stopPropagation()
                      state.removeEntry(index)
                    }}
                    aria-label={`${track.title} parçasını setten çıkar`}
                  >
                    ✕
                  </button>
                </span>
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
    </section>
  )
}
