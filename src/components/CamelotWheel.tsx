import { NOTE_NAME, compatibleKeys, keyColor, relationInfo } from '../lib/camelot'
import { toneColor } from '../lib/ui'
import type { RelationId } from '../lib/types'

export interface CamelotWheelProps {
  active: string | null
  allowed: RelationId[]
  onSelect?: (code: string) => void
  size?: number
}

function polar(cx: number, cy: number, radius: number, degrees: number): [number, number] {
  const radians = (degrees * Math.PI) / 180
  return [
    Math.round((cx + radius * Math.cos(radians)) * 100) / 100,
    Math.round((cy + radius * Math.sin(radians)) * 100) / 100,
  ]
}

function sectorPath(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  from: number,
  to: number,
): string {
  const [x0, y0] = polar(cx, cy, outer, from)
  const [x1, y1] = polar(cx, cy, outer, to)
  const [x2, y2] = polar(cx, cy, inner, to)
  const [x3, y3] = polar(cx, cy, inner, from)
  return `M${x0} ${y0} A${outer} ${outer} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${inner} ${inner} 0 0 0 ${x3} ${y3} Z`
}

const DIM_FILL = '#1b212a'

export function CamelotWheel({ active, allowed, onSelect, size = 220 }: CamelotWheelProps) {
  const center = size / 2
  const outerRing = { inner: size * 0.355, outer: size * 0.478 }
  const innerRing = { inner: size * 0.21, outer: size * 0.335 }

  const targets = new Map(
    compatibleKeys(active, allowed).map((item) => [item.code, item.relation] as const),
  )

  const slices = []
  for (let number = 1; number <= 12; number += 1) {
    const from = (number - 1) * 30 - 105
    const to = from + 30

    for (const letter of ['B', 'A'] as const) {
      const code = `${number}${letter}`
      const ring = letter === 'B' ? outerRing : innerRing
      const isActive = code === active
      const relation = targets.get(code)
      const info = relation ? relationInfo(relation) : null

      const fill = isActive ? keyColor(code) : info ? toneColor(info.tone) : DIM_FILL
      const title = isActive
        ? `${code} · ${NOTE_NAME[code]} — şu anki key`
        : info
          ? `${code} · ${NOTE_NAME[code]} — ${info.label}`
          : `${code} · ${NOTE_NAME[code]} — bu ilişki kapalı`

      slices.push(
        <path
          key={code}
          className="wheel-slice"
          d={sectorPath(center, center, ring.inner, ring.outer, from, to)}
          fill={fill}
          fillOpacity={isActive ? 1 : info ? 0.82 : 1}
          stroke={isActive ? '#ffffff' : 'var(--bg)'}
          strokeWidth={isActive ? 2 : 1}
          onClick={onSelect ? () => onSelect(code) : undefined}
        >
          <title>{title}</title>
        </path>,
      )
    }

    const [labelX, labelY] = polar(center, center, size * 0.417, from + 15)
    slices.push(
      <text
        key={`label-${number}`}
        className="wheel-label"
        x={labelX}
        y={labelY}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {number}
      </text>,
    )
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={active ? `Camelot çemberi, aktif key ${active}` : 'Camelot çemberi'}
    >
      {slices}
      <text
        x={center}
        y={center - 6}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--text)"
        fontFamily="var(--font-mono)"
        fontSize={size * 0.1}
      >
        {active ?? '—'}
      </text>
      <text
        x={center}
        y={center + 12}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--text-muted)"
        fontFamily="var(--font-mono)"
        fontSize={size * 0.06}
      >
        {active ? (NOTE_NAME[active] ?? '') : 'key yok'}
      </text>
    </svg>
  )
}
