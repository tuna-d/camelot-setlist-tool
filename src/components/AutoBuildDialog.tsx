import { useMemo, useState } from 'react'
import { SHAPES, buildSet } from '../lib/setbuilder'
import type { EnergyShape } from '../lib/setbuilder'
import { formatDelta } from '../lib/suggest'
import { formatTotal, toneColor } from '../lib/ui'
import { relationInfo } from '../lib/camelot'
import {
  selectEnergyScale,
  selectExclude,
  selectPool,
  selectRatingIndex,
  selectReference,
  useStore,
} from '../store/store'
import { Bpm, KeyChip, SeenBadge } from './common'
import { Dialog } from './common'

export interface AutoBuildDialogProps {
  open: boolean
  onClose: () => void
}

export function AutoBuildDialog({ open, onClose }: AutoBuildDialogProps) {
  const state = useStore()
  const [minutes, setMinutes] = useState(60)
  const [bpmSpan, setBpmSpan] = useState(8)
  const [shape, setShape] = useState<EnergyShape>('arc')
  const [replace, setReplace] = useState(false)

  const reference = useMemo(() => selectReference(state), [state])
  const pool = useMemo(() => selectPool(state), [state])
  const exclude = useMemo(() => selectExclude(state), [state])
  const scale = selectEnergyScale(state)
  const ratings = selectRatingIndex(state)

  const result = useMemo(() => {
    if (!reference) return null
    return buildSet({
      seed: reference,
      pool,
      minutes,
      tolerance: state.tolerance,
      relations: state.relations,
      shape,
      bpmSpan,
      exclude: replace ? new Set<string>() : exclude,
      energy: { scale, ratings },
    })
  }, [
    reference,
    pool,
    minutes,
    state.tolerance,
    state.relations,
    shape,
    bpmSpan,
    replace,
    exclude,
    scale,
    ratings,
  ])

  function apply() {
    if (!result) return
    const tracks = result.steps.map((step) => step.track)
    if (replace) {
      state.replaceEntries(tracks)
    } else {
      for (const track of tracks.slice(1)) state.addTrack(track)
    }
    onClose()
  }

  return (
    <Dialog open={open} title="Build the set automatically" onClose={onClose}>
      {!reference ? (
        <p className="muted">
          Add a starting track to the setlist first. The builder continues from that track.
        </p>
      ) : (
        <div className="col">
          <div className="row-wrap">
            <span className="faint">starting from:</span>
            <strong>{reference.title}</strong>
            <KeyChip code={reference.key} />
            <Bpm value={reference.bpm} />
          </div>

          <label className="col">
            <span className="faint">length · {minutes} minutes</span>
            <input
              type="range"
              min={20}
              max={240}
              step={5}
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
            />
          </label>

          <label className="col">
            <span className="faint">tempo span · {bpmSpan} BPM</span>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={bpmSpan}
              onChange={(event) => setBpmSpan(Number(event.target.value))}
            />
          </label>

          <div className="row-wrap">
            {SHAPES.map((item) => (
              <button
                key={item.id}
                type="button"
                className="chip"
                aria-pressed={shape === item.id}
                title={item.hint}
                onClick={() => setShape(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="row">
            <input
              type="checkbox"
              checked={replace}
              onChange={(event) => setReplace(event.target.checked)}
            />
            <span>replace the current set</span>
          </label>

          {result ? (
            <>
              <div className="row-wrap">
                <h3>
                  preview · {result.steps.length} tracks · {formatTotal(result.totalSeconds)}
                </h3>
              </div>

              {result.shortfall ? <p className="error">{result.shortfall}</p> : null}

              {result.steps.map((step, index) => {
                const info = step.relation ? relationInfo(step.relation) : null
                return (
                  <div className="entry" key={`${step.track.id}-${index}`}>
                    <span className="mono faint entry-index">{index + 1}</span>
                    <span className="entry-title">
                      <SeenBadge track={step.track} />
                      <strong>{step.track.title}</strong>
                      <span className="muted"> — {step.track.artist}</span>
                    </span>
                    {info ? (
                      <span style={{ color: toneColor(info.tone) }}>{info.label}</span>
                    ) : (
                      <span className="faint">start</span>
                    )}
                    <KeyChip code={step.track.key} />
                    <Bpm value={step.track.bpm} />
                    <span
                      className="mono faint"
                      title={
                        step.energy
                          ? `${step.energy.rated ? 'Rated' : 'Estimated'} energy ${step.energy.level}/5, aiming for ${step.targetEnergy?.toFixed(1)}`
                          : 'No energy: the track has no tempo and no rating'
                      }
                    >
                      {step.energy ? `E${step.energy.level}${step.energy.rated ? '' : '?'}` : 'E–'}
                    </span>
                    <span className="mono faint">{step.delta ? formatDelta(step.delta) : '—'}</span>
                  </div>
                )
              })}

              <button
                type="button"
                className="btn btn-primary"
                onClick={apply}
                disabled={result.steps.length < 2}
              >
                {replace ? 'replace the set with this' : 'add to the set'}
              </button>
            </>
          ) : null}
        </div>
      )}
    </Dialog>
  )
}
