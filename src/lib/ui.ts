import type { Tone } from './types'

const TONE_COLORS: Record<Tone, string> = {
  neutral: '#98a2b3',
  energy: '#ff8a4c',
  calm: '#5cb4e0',
  color: '#b78cff',
  jump: '#f2c14e',
  risk: '#f2545b',
}

export function toneColor(tone: Tone | null | undefined): string {
  return tone ? (TONE_COLORS[tone] ?? TONE_COLORS.neutral) : TONE_COLORS.neutral
}

export function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '—'
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

export function formatTotal(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 min'
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`
}

export function formatBpm(bpm: number | null | undefined): string {
  if (typeof bpm !== 'number' || !Number.isFinite(bpm)) return '—'
  return Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1)
}

/** Colour of the 0-100 match score: green is a strong blend, red is a strain. */
const SCORE_STEPS: { min: number; color: string }[] = [
  { min: 85, color: '#5ce088' },
  { min: 70, color: '#9fd85f' },
  { min: 55, color: '#e0ca5c' },
  { min: 40, color: '#ff8a4c' },
  { min: -Infinity, color: '#f2545b' },
]

export function scoreColor(score: number | null | undefined): string {
  if (typeof score !== 'number' || !Number.isFinite(score)) return TONE_COLORS.neutral
  return SCORE_STEPS.find((step) => score >= step.min)!.color
}

/**
 * Colour of a tolerance step: a narrow window is green (no strain on the pitch),
 * a wide one is red. Same ladder as scoreColor, walked in the other direction.
 */
const TOLERANCE_STEPS_COLORS: { upTo: number; color: string }[] = [
  { upTo: 3, color: '#5ce088' },
  { upTo: 6, color: '#9fd85f' },
  { upTo: 8, color: '#e0ca5c' },
  { upTo: 10, color: '#ff8a4c' },
  { upTo: Infinity, color: '#f2545b' },
]

export function toleranceColor(tolerance: number | null | undefined): string {
  if (typeof tolerance !== 'number' || !Number.isFinite(tolerance)) return TONE_COLORS.neutral
  return TOLERANCE_STEPS_COLORS.find((step) => tolerance <= step.upTo)!.color
}
