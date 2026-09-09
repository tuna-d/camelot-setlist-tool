import { useMemo } from 'react'
import { RELATIONS } from '../lib/camelot'
import {
  TOLERANCE_STEPS,
  bpmRange,
  formatDelta,
  groupByRelation,
  suggest,
} from '../lib/suggest'
import { formatBpm, scoreColor, toleranceColor, toneColor } from '../lib/ui'
import {
  selectExclude,
  selectGenres,
  selectPool,
  selectReference,
  useStore,
} from '../store/store'
import { CamelotWheel } from './CamelotWheel'
import { Bpm, KeyChip, TrackLinks } from './common'

const SUGGESTION_LIMIT = 60

export function SuggestPanel() {
  const state = useStore()

  const reference = useMemo(() => selectReference(state), [state])
  const pool = useMemo(() => selectPool(state), [state])
  const genres = useMemo(() => selectGenres(state), [state])
  const exclude = useMemo(() => selectExclude(state), [state])

  const groups = useMemo(() => {
    if (!reference) return []
    return groupByRelation(
      suggest(reference, pool, {
        tolerance: state.tolerance,
        relations: state.relations,
        genres: state.genres,
        exclude,
        limit: SUGGESTION_LIMIT,
      }),
    )
  }, [reference, pool, state.tolerance, state.relations, state.genres, exclude])

  const range = reference?.bpm ? bpmRange(reference.bpm, state.tolerance) : null
  const total = groups.reduce((count, group) => count + group.items.length, 0)

  return (
    <section className="panel col suggest-panel" aria-label="Suggestions">
      <div className="row-wrap">
        <h2>Suggestions</h2>
        {reference ? (
          <span className="chip chip-static">{total} candidates</span>
        ) : null}
        <span className="spacer" />
        <button
          type="button"
          className="chip"
          aria-pressed={state.poolSource === 'catalog'}
          onClick={() => state.setPoolSource('catalog')}
        >
          Discovery
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={state.poolSource === 'library'}
          onClick={() => state.setPoolSource('library')}
        >
          My library
        </button>
      </div>

      {!reference ? (
        <p className="muted">
          Add a track to the setlist first. Suggestions are built from its key and tempo.
        </p>
      ) : (
        <>
          <div className="suggest-head">
            <div className="reference row-wrap">
              <CamelotWheel active={reference.key} allowed={state.relations} size={190} />
              <div className="col">
                <strong>{reference.title}</strong>
                <span className="muted">{reference.artist}</span>
                <div className="row">
                  <KeyChip code={reference.key} />
                  <Bpm value={reference.bpm} />
                </div>
                {range ? (
                  <span className="faint mono">
                    target {formatBpm(range.min)} – {formatBpm(range.max)} BPM
                  </span>
                ) : null}
                <span className="faint">
                  {state.poolSource === 'catalog' ? 'Discovery catalog' : 'My library'} · {pool.length}{' '}
                  tracks
                </span>
              </div>
            </div>

            <div className="col filters">
              <div className="col">
                <div className="row-wrap">
                  <span className="faint">tempo tolerance · {state.tolerance}%</span>
                  <span className="spacer" />
                  {range ? (
                    <span className="faint mono">
                      {formatBpm(range.min)} – {formatBpm(range.max)} BPM
                    </span>
                  ) : null}
                </div>
                <div className="segmented" role="group" aria-label="Tempo tolerance">
                  {TOLERANCE_STEPS.map((step) => (
                    <button
                      key={step}
                      type="button"
                      className="segment"
                      aria-pressed={state.tolerance === step}
                      onClick={() => state.setTolerance(step)}
                      title={`Suggest tracks that strain the pitch by at most ${step}%`}
                      style={
                        state.tolerance === step ? { color: toleranceColor(step) } : undefined
                      }
                    >
                      ±{step}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="col">
                <h3>relations</h3>
                <div className="row-wrap">
                  {RELATIONS.map((info) => (
                    <button
                      key={info.id}
                      type="button"
                      className="chip"
                      aria-pressed={state.relations.includes(info.id)}
                      onClick={() => state.toggleRelation(info.id)}
                      title={info.hint}
                      style={
                        state.relations.includes(info.id)
                          ? {
                              background: `color-mix(in srgb, ${toneColor(info.tone)} 16%, transparent)`,
                              borderColor: toneColor(info.tone),
                              color: toneColor(info.tone),
                            }
                          : undefined
                      }
                    >
                      {info.label}
                    </button>
                  ))}
                </div>
              </div>

              {genres.length > 0 ? (
                <div className="col">
                  <h3>
                    genres
                    {state.genres.length > 0 ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => state.setGenres([])}
                      >
                        clear filter
                      </button>
                    ) : null}
                  </h3>
                  <div className="row-wrap">
                    {genres.map((genre) => (
                      <button
                        key={genre}
                        type="button"
                        className="chip"
                        aria-pressed={state.genres.includes(genre)}
                        onClick={() => state.toggleGenre(genre)}
                      >
                        {genre}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {total === 0 ? (
            <p className="muted">
              No candidates with these filters. Raise the tolerance, turn on a relation you disabled, or
              switch the pool (Discovery ↔ My library).
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.info.id} className="col">
                <h3 style={{ color: toneColor(group.info.tone) }} title={group.info.hint}>
                  {group.info.label} · {group.items.length}
                </h3>
                <div className="entries">
                  {group.items.map((item) => (
                    <div className="entry" key={item.track.id}>
                      <span
                        className="score"
                        style={{ color: scoreColor(item.score) }}
                        title="Match score out of 100: relation and tempo closeness"
                      >
                        {Math.round(item.score)}
                      </span>
                      <span className="entry-title">
                        <strong>{item.track.title}</strong>
                        <span className="muted"> — {item.track.artist}</span>
                      </span>
                      <span className="entry-meta">
                        <KeyChip code={item.track.key} />
                        <Bpm value={item.track.bpm} />
                        <span className="mono faint" title="tempo gap against the reference">
                          {formatDelta(item.delta)}
                        </span>
                        <TrackLinks track={item.track} />
                        <button
                          type="button"
                          className="btn btn-accent btn-sm"
                          onClick={() => state.addTrack(item.track)}
                        >
                          add
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </section>
  )
}
