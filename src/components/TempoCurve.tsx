import { keyColor } from '../lib/camelot'
import { ENERGY_LEVELS, energyLevel } from '../lib/energy'
import type { EntryEnergy } from '../lib/energy'
import { formatBpm } from '../lib/ui'

export interface CurvePoint {
  bpm: number | null
  key: string | null
  label?: string
}

export interface TempoCurveProps {
  points: CurvePoint[]
  /**
   * Energy per point, by position. A null or missing position leaves a gap: a zero-height
   * bar would read as "no energy", which is not what an unknown level means.
   */
  energy?: readonly (EntryEnergy | null)[]
  height?: number
}

const WIDTH = 320
const PADDING = 10
// A two-track set would otherwise get bars wide enough to hide the line.
const MAX_BAR_WIDTH = 14

/** The entry's energy when its level is a real one; anything else draws as a gap. */
function usableEnergy(energy: EntryEnergy | null | undefined): EntryEnergy | null {
  const level = energyLevel(energy?.level)
  return level === null ? null : { level, rated: energy?.rated === true }
}

export function TempoCurve({ points, energy = [], height = 64 }: TempoCurveProps) {
  const values = points.map((point) => point.bpm).filter((bpm): bpm is number => bpm !== null)

  if (values.length < 2) {
    return <p className="faint">The tempo curve needs at least two tracks with a tempo.</p>
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 4
  const usable = height - PADDING * 2

  const levels = points.map((_, index) => usableEnergy(energy[index]))
  const coords = points.map((point, index) => {
    const x =
      PADDING + (index / Math.max(1, points.length - 1)) * (WIDTH - PADDING * 2)
    const bpm = point.bpm ?? (min + max) / 2
    const y = height - PADDING - ((bpm - min) / span) * usable
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, point }
  })

  const line = coords.map((item) => `${item.x},${item.y}`).join(' ')

  const step = (WIDTH - PADDING * 2) / Math.max(1, points.length - 1)
  const barWidth = Math.round(Math.min(MAX_BAR_WIDTH, step * 0.6) * 100) / 100
  const bars = coords.flatMap((item, index) => {
    const level = levels[index]
    if (level === null) return []
    const barHeight = Math.round((level.level / ENERGY_LEVELS) * usable * 100) / 100
    return [
      {
        index,
        x: Math.round((item.x - barWidth / 2) * 100) / 100,
        y: Math.round((height - PADDING - barHeight) * 100) / 100,
        height: barHeight,
        rated: level.rated,
      },
    ]
  })

  return (
    <svg
      className="tempo-curve"
      viewBox={`0 0 ${WIDTH} ${height}`}
      height={height}
      role="img"
      aria-label={`Tempo curve: ${formatBpm(values[0])} BPM to ${formatBpm(values[values.length - 1])} BPM`}
    >
      {bars.map((bar) => (
        <rect
          key={bar.index}
          className={`energy-bar ${bar.rated ? 'rated' : 'estimated'}`}
          x={bar.x}
          y={bar.y}
          width={barWidth}
          height={bar.height}
          rx={2}
        />
      ))}
      <polyline className="tempo-line" points={line} />
      {coords.map((item, index) => (
        <circle
          key={index}
          cx={item.x}
          cy={item.y}
          r={3.5}
          fill={keyColor(item.point.key)}
          stroke="var(--bg)"
          strokeWidth={1}
        >
          <title>
            {`${index + 1}. ${item.point.label ?? 'track'} — ${formatBpm(item.point.bpm)} BPM${
              item.point.key ? ` · ${item.point.key}` : ''
            }${energyText(levels[index])}`}
          </title>
        </circle>
      ))}
    </svg>
  )
}

function energyText(energy: EntryEnergy | null): string {
  if (energy === null) return ''
  return ` · energy ${energy.level}${energy.rated ? '' : ' (estimated)'}`
}
