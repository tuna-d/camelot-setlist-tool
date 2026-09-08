/**
 * Öneri paneli: referans parça, süzgeçler ve ilişkiye göre gruplanmış adaylar.
 *
 * Parça verisi hiçbir yerde HTML attribute'una gömülmüyor — düğmeler diziden
 * okunan parçayı kapanışla taşıyor. (`Becca's Booty` gibi bir başlık attribute'u
 * erken kapatıp düğmeyi sessizce kırıyordu.)
 */

import { useMemo } from 'react'
import { RELATIONS } from '../lib/camelot'
import {
  MAX_TOLERANCE,
  MIN_TOLERANCE,
  bpmRange,
  formatDelta,
  groupByRelation,
  suggest,
} from '../lib/suggest'
import { formatBpm, toneColor } from '../lib/ui'
import {
  selectExclude,
  selectGenres,
  selectPool,
  selectReference,
  useStore,
} from '../store/store'
import { CamelotWheel } from './CamelotWheel'
import { Bpm, KeyChip, TrackLinks } from './common'

/** Listede gösterilecek en fazla aday: daha uzun liste seçimi kolaylaştırmıyor. */
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
    <section className="panel col" aria-label="Öneriler">
      <div className="row-wrap">
        <h2>Öneriler</h2>
        <span className="spacer" />
        <button
          type="button"
          className="chip"
          aria-pressed={state.poolSource === 'catalog'}
          onClick={() => state.setPoolSource('catalog')}
        >
          Keşif
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={state.poolSource === 'library'}
          onClick={() => state.setPoolSource('library')}
        >
          Kütüphanem
        </button>
      </div>

      {!reference ? (
        <p className="muted">
          Önce setliste bir parça ekle. Öneriler o parçanın key ve temposuna göre kurulur.
        </p>
      ) : (
        <>
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
                  hedef {formatBpm(range.min)} – {formatBpm(range.max)} BPM
                </span>
              ) : null}
              <span className="faint">
                {state.poolSource === 'catalog' ? 'Keşif katalogu' : 'Kütüphanem'} · {pool.length}{' '}
                parça
              </span>
            </div>
          </div>

          <label className="col">
            <span className="faint">
              tempo toleransı · %{state.tolerance}
              {range ? ` (${formatBpm(range.min)} – ${formatBpm(range.max)} BPM)` : ''}
            </span>
            <input
              type="range"
              min={MIN_TOLERANCE}
              max={MAX_TOLERANCE}
              step={1}
              value={state.tolerance}
              onChange={(event) => state.setTolerance(Number(event.target.value))}
            />
          </label>

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
                    ? { borderColor: toneColor(info.tone), color: toneColor(info.tone) }
                    : undefined
                }
              >
                {info.label}
              </button>
            ))}
          </div>

          {genres.length > 0 ? (
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
              {state.genres.length > 0 ? (
                <button type="button" className="btn btn-ghost" onClick={() => state.setGenres([])}>
                  tür süzgecini kaldır
                </button>
              ) : null}
            </div>
          ) : null}

          {total === 0 ? (
            <p className="muted">
              Bu süzgeçlerle aday çıkmadı. Toleransı yükselt, kapalı ilişkileri aç ya da havuzu
              değiştir (Keşif ↔ Kütüphanem).
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.info.id} className="col">
                <h3 style={{ color: toneColor(group.info.tone) }} title={group.info.hint}>
                  {group.info.label} · {group.items.length}
                </h3>
                {group.items.map((item) => (
                  <div className="entry" key={item.track.id}>
                    <span className="mono faint entry-index">{Math.round(item.score)}</span>
                    <span className="entry-title">
                      <strong>{item.track.title}</strong>
                      <span className="muted"> — {item.track.artist}</span>
                    </span>
                    <KeyChip code={item.track.key} />
                    <Bpm value={item.track.bpm} />
                    <span className="mono faint" title="referansa göre tempo farkı">
                      {formatDelta(item.delta)}
                    </span>
                    <TrackLinks track={item.track} />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => state.addTrack(item.track)}
                    >
                      ekle
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </>
      )}
    </section>
  )
}
