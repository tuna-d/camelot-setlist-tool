/**
 * Setlist boyunca tempo çizgisi. Noktalar key rengiyle boyanır:
 * enerjinin nereye gittiği ve keylerin nerede tekrar ettiği aynı bakışta görünsün.
 */

import { keyColor } from '../lib/camelot'
import { formatBpm } from '../lib/ui'

export interface CurvePoint {
  bpm: number | null
  key: string | null
  label?: string
}

export interface TempoCurveProps {
  points: CurvePoint[]
  height?: number
}

const WIDTH = 320
const PADDING = 10

export function TempoCurve({ points, height = 64 }: TempoCurveProps) {
  const values = points.map((point) => point.bpm).filter((bpm): bpm is number => bpm !== null)

  if (values.length < 2) {
    return <p className="faint">Tempo eğrisi için sette en az iki tempolu parça gerekiyor.</p>
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  // Düz sette bile çizgi ortada dursun: aralık sıfırsa yapay bir bant açıyoruz.
  const span = max - min || 4
  const usable = height - PADDING * 2

  const coords = points.map((point, index) => {
    const x =
      PADDING + (index / Math.max(1, points.length - 1)) * (WIDTH - PADDING * 2)
    const bpm = point.bpm ?? (min + max) / 2
    const y = height - PADDING - ((bpm - min) / span) * usable
    return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, point }
  })

  const line = coords.map((item) => `${item.x},${item.y}`).join(' ')

  return (
    <svg
      className="tempo-curve"
      viewBox={`0 0 ${WIDTH} ${height}`}
      height={height}
      role="img"
      aria-label={`Tempo eğrisi: ${formatBpm(values[0])} BPM'den ${formatBpm(values[values.length - 1])} BPM'e`}
    >
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
            {`${index + 1}. ${item.point.label ?? 'parça'} — ${formatBpm(item.point.bpm)} BPM${
              item.point.key ? ` · ${item.point.key}` : ''
            }`}
          </title>
        </circle>
      ))}
    </svg>
  )
}
