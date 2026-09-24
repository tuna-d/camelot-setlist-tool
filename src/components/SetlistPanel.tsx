import { useMemo, useState } from 'react'
import { relationInfo } from '../lib/camelot'
import { entryEnergy } from '../lib/energy'
import { advanceQueue, EMPTY_QUEUE, queueView } from '../lib/queue'
import { transition } from '../lib/setstats'
import { formatDelta } from '../lib/suggest'
import { formatDuration, formatTotal, toneColor } from '../lib/ui'
import { selectActive, selectEnergyScale, selectEntryRows, useStore } from '../store/store'
import type { EntryRow } from '../store/store'
import {
  Bpm,
  EnergyStars,
  FavoriteButton,
  KeyChip,
  SeenBadge,
  TrackLinks,
  youtubeSearchUrl,
} from './common'
import type { Track } from '../lib/types'

function TransitionBridge({ from, to, tolerance }: { from: Track; to: Track; tolerance: number }) {
  const step = transition(from, to, tolerance)
  const info = step.relation ? relationInfo(step.relation) : null

  const color = step.ok && info ? toneColor(info.tone) : 'var(--danger)'
  const label = info ? info.label : 'Uyumsuz key'
  const tempoText = step.delta === null ? 'tempo bilinmiyor' : `${formatDelta(step.delta)} BPM`
  const warning = !info
    ? 'These two keys have no defined transition — put a compatible track between them.'
    : !step.tempoOk
      ? `The tempo gap is outside your tolerance (${tolerance}%) — it strains the pitch.`
      : (info.hint ?? '')

  return (
    <div className="bridge" style={{ borderColor: color }} title={warning}>
      <span className="bridge-line" style={{ background: color }} />
      <span style={{ color }}>{label}</span>
      <span className="mono faint">{tempoText}</span>
      {step.delta?.halved ? <span className="faint">half/double tempo</span> : null}
      {!step.ok ? <span style={{ color: 'var(--danger)' }}>⚠ {warning}</span> : null}
    </div>
  )
}

export interface SetlistPanelProps {
  onOpenSearch?: () => void
  onOpenAutoBuild?: () => void
}

export function SetlistPanel(props: SetlistPanelProps) {
  // Keyed by the set so the YouTube queue starts over whenever another set is opened,
  // without resetting state from an effect.
  const activeId = useStore((state) => selectActive(state).id)
  return <SetlistPanelBody key={activeId} {...props} />
}

function SetlistPanelBody({ onOpenSearch, onOpenAutoBuild }: SetlistPanelProps) {
  // Whole-state subscription on purpose: derived lists would break per-selector caching.
  const state = useStore()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  // Session only: nothing about the pass is written to the record.
  const [queue, setQueue] = useState(EMPTY_QUEUE)

  const active = selectActive(state)
  // Rows keep entries whose track is gone, so every row edits the entry it shows.
  const rows = useMemo(() => selectEntryRows(state), [state])
  const resolved = rows.filter((row): row is EntryRow & { track: Track } => row.track !== null)
  const tracks = resolved.map((row) => row.track)
  const missingCount = rows.length - resolved.length
  const energyScale = selectEnergyScale(state)
  const totalSeconds = tracks.reduce((total, track) => total + (track.duration ?? 360), 0)
  const trackIds = tracks.map((track) => track.id)
  const pass = queueView(trackIds, queue)
  const nextTrack = pass.nextIndex >= 0 ? tracks[pass.nextIndex] : null
  // The queue counts resolved tracks only; this is the entry position it points at.
  const queuedIndex = pass.nextIndex >= 0 ? resolved[pass.nextIndex].index : -1

  // The browser opens the tab itself from the link, never a script: nothing for a popup
  // blocker to catch, and ctrl/cmd+click or middle-click keep this page in front.
  function advancePastNext() {
    setQueue(advanceQueue(trackIds, queue))
  }

  function handleDrop(target: number) {
    if (dragIndex !== null && dragIndex !== target) state.moveEntry(dragIndex, target)
    setDragIndex(null)
  }

  return (
    <section className="panel col setlist-panel" aria-label="Setlist">
      <div className="row-wrap">
        <h2>{active.name}</h2>
        <span className="chip chip-static">
          {tracks.length} tracks · {formatTotal(totalSeconds)}
        </span>
        {missingCount > 0 ? (
          <span
            className="chip chip-static chip-missing"
            title="Tracks this set points at that are no longer in your library or the discovery catalog"
          >
            {missingCount} missing
          </span>
        ) : null}
        <span className="spacer" />
        {onOpenSearch ? (
          <button type="button" className="btn" onClick={onOpenSearch}>
            find a track
          </button>
        ) : null}
        {onOpenAutoBuild ? (
          <button type="button" className="btn btn-accent" onClick={onOpenAutoBuild}>
            build it for me
          </button>
        ) : null}
      </div>

      {tracks.length > 0 ? (
        <div className="row-wrap queue-bar">
          {nextTrack ? (
            <a
              className="btn btn-sm btn-youtube queue-open"
              href={youtubeSearchUrl(nextTrack)}
              target="_blank"
              rel="noreferrer"
              onClick={advancePastNext}
              onAuxClick={(event) => {
                // Middle button only: a right click opens the context menu, not a tab.
                if (event.button === 1) advancePastNext()
              }}
              title={`Search YouTube for ${nextTrack.title}`}
            >
              ▶ next on YouTube
            </a>
          ) : (
            <button type="button" className="btn btn-sm btn-youtube queue-open" disabled>
              ▶ next on YouTube
            </button>
          )}
          <span className="mono queue-count" title="Tracks opened on YouTube">
            {pass.openedCount} / {pass.total}
          </span>
          {nextTrack ? (
            <span className="faint queue-hint">ctrl/⌘+click or middle-click to stay here</span>
          ) : null}
          {pass.finished ? (
            <span className="muted queue-done">
              Every track has been opened. Reset to go through the set again.
            </span>
          ) : null}
          {queue.opened.length > 0 ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm queue-reset"
              onClick={() => setQueue(EMPTY_QUEUE)}
            >
              reset
            </button>
          ) : null}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="muted">
          Empty set. Add a starting track with "find a track", then keep going from the suggestions below.
        </p>
      ) : (
        <ol className="entries entries-scroll">
          {rows.map(({ entry, index, track }) => {
            const previous = index > 0 ? rows[index - 1].track : null
            if (!track) {
              return (
                <li key={`missing-${entry.trackId}-${index}`}>
                  <div
                    className="entry entry-missing"
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleDrop(index)}
                  >
                    <span className="mono entry-index">{index + 1}</span>
                    <span className="entry-title muted">
                      This track is no longer available: it left your library or the discovery
                      catalog. Remove it, then find it again with "find a track" if you still want it.
                    </span>
                    <span className="entry-meta">
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-danger"
                        onClick={() => state.removeEntry(index)}
                        aria-label="Remove the missing track from the set"
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                  {entry.note ? <p className="faint entry-missing-note">note: {entry.note}</p> : null}
                </li>
              )
            }

            const isQueued = index === queuedIndex
            return (
              <li key={`${track.id}-${index}`}>
                {previous ? (
                  <TransitionBridge from={previous} to={track} tolerance={state.tolerance} />
                ) : null}

                <div
                  className={isQueued ? 'entry entry-queued' : 'entry'}
                  data-queue={isQueued ? 'next' : undefined}
                  title={isQueued ? 'Next on YouTube' : undefined}
                  draggable
                  aria-current={index === state.cursor}
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(index)}
                  onClick={() => state.setCursor(index)}
                >
                  <span className="mono entry-index">{index + 1}</span>
                  <span className="entry-title">
                    <SeenBadge track={track} />
                    <strong>{track.title}</strong>
                    <span className="muted"> — {track.artist}</span>
                  </span>
                  <span className="entry-meta">
                    <KeyChip code={track.key} />
                    <Bpm value={track.bpm} />
                    <span className="mono faint">{formatDuration(track.duration)}</span>
                    <FavoriteButton track={track} />
                    <TrackLinks track={track} />
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-danger"
                      onClick={(event) => {
                        event.stopPropagation()
                        state.removeEntry(index)
                      }}
                      aria-label={`Remove ${track.title} from the set`}
                    >
                      ✕
                    </button>
                  </span>
                </div>

                <div className="entry-extras">
                  <span className="entry-energy">
                    <span className="faint">energy</span>
                    <EnergyStars
                      energy={entryEnergy(energyScale, entry, track)}
                      onChange={(value) => state.setEntryEnergy(index, value)}
                      label={`Energy rating for ${track.title}`}
                    />
                  </span>
                  <input
                    className="input entry-note"
                    placeholder="track note"
                    value={entry.note ?? ''}
                    onChange={(event) => state.setEntryNote(index, event.target.value)}
                  />
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
