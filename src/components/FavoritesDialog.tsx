import { useMemo, useState } from 'react'
import { relationInfo } from '../lib/camelot'
import { trackKey } from '../lib/suggest'
import { localSearch } from '../lib/search'
import { transition } from '../lib/setstats'
import { toneColor } from '../lib/ui'
import { selectActive, selectExclude, selectReference, useStore } from '../store/store'
import { Bpm, Dialog, FavoriteButton, KeyChip, SeenBadge, TrackLinks } from './common'
import type { Track } from '../lib/types'

/** How a favorite would follow the selected track, so a fitting one is easy to spot. */
function FitBadge({ from, to, tolerance }: { from: Track; to: Track; tolerance: number }) {
  const step = transition(from, to, tolerance)
  const info = step.relation ? relationInfo(step.relation) : null

  if (!info || !step.ok) {
    const why = !info ? 'the keys do not mix' : 'the tempo gap is outside your tolerance'
    return (
      <span className="fit-badge faint" title={`Not a clean follow-up to ${from.title}: ${why}.`}>
        no fit
      </span>
    )
  }

  const color = toneColor(info.tone)
  return (
    <span
      className="fit-badge"
      style={{ borderColor: color, color }}
      title={`Fits after ${from.title}: ${info.hint}`}
    >
      {info.label}
    </span>
  )
}

export interface FavoritesDialogProps {
  open: boolean
  onClose: () => void
}

export function FavoritesDialog({ open, onClose }: FavoritesDialogProps) {
  const state = useStore()
  const [query, setQuery] = useState('')

  const active = selectActive(state)
  const reference = useMemo(() => selectReference(state), [state])
  const inSet = useMemo(() => selectExclude(state), [state])
  const shown = useMemo(
    () => (query.trim() ? localSearch(query, state.favorites, state.favorites.length) : state.favorites),
    [query, state.favorites],
  )

  function close() {
    setQuery('')
    onClose()
  }

  return (
    <Dialog open={open} title={`Favorites · ${state.favorites.length}`} onClose={close}>
      {state.favorites.length === 0 ? (
        <p className="muted">
          No favorites yet. Press the heart next to a track — in your set, in the suggestions or in
          search — and it waits here until you need it.
        </p>
      ) : (
        <>
          <input
            className="input"
            placeholder="filter favorites by track or artist"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          {reference ? (
            <p className="faint">
              Badges show how each favorite would follow <strong>{reference.title}</strong>, the
              selected track in your set.
            </p>
          ) : null}

          {shown.length === 0 ? (
            <p className="muted">No favorite matches "{query.trim()}". Clear the filter to see them all.</p>
          ) : (
            <div className="entries fav-list">
              {shown.map((track) => {
                const added = inSet.has(track.id) || inSet.has(trackKey(track))
                return (
                  <div className="entry" key={track.id}>
                    <FavoriteButton track={track} />
                    <span className="entry-title">
                      <SeenBadge track={track} />
                      <strong>{track.title}</strong>
                      <span className="muted"> — {track.artist}</span>
                      {track.genre ? <span className="faint"> · {track.genre}</span> : null}
                    </span>
                    <span className="entry-meta">
                      {reference && !added ? (
                        <FitBadge from={reference} to={track} tolerance={state.tolerance} />
                      ) : null}
                      <KeyChip code={track.key} />
                      <Bpm value={track.bpm} />
                      <TrackLinks track={track} />
                      <button
                        type="button"
                        className="btn btn-accent btn-sm"
                        disabled={added}
                        title={added ? `Already in ${active.name}` : `Add to ${active.name}`}
                        onClick={() => state.addTrack(track)}
                      >
                        {added ? 'in set' : 'add'}
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </Dialog>
  )
}
