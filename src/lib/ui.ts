/**
 * Arayüzün saf yardımcıları — React'e ve DOM'a dokunmaz.
 * İlişki renklerinin tek kaynağı burası; CSS'te ikinci bir kopya tutulmuyor,
 * bileşenler rengi satır içi stil olarak veriyor.
 */

import type { Tone } from './types'

const TONE_COLORS: Record<Tone, string> = {
  neutral: '#98a2b3',
  energy: '#ff8a4c',
  calm: '#5cb4e0',
  color: '#b78cff',
  jump: '#f2c14e',
  risk: '#f2545b',
}

/** İlişki tonunun rengi. Bilinmeyen tonda nötr gri döner. */
export function toneColor(tone: Tone | null | undefined): string {
  return tone ? (TONE_COLORS[tone] ?? TONE_COLORS.neutral) : TONE_COLORS.neutral
}

/** Saniyeyi `4:12` biçimine çevirir; bilinmiyorsa tire. */
export function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '—'
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

/** Toplam süreyi `1 sa 24 dk` biçiminde yazar. */
export function formatTotal(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 dk'
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours} sa ${minutes % 60} dk` : `${minutes} dk`
}

/** BPM'i sütunda hizalanacak biçimde yazar: tam sayı ise ondalık gösterme. */
export function formatBpm(bpm: number | null | undefined): string {
  if (typeof bpm !== 'number' || !Number.isFinite(bpm)) return '—'
  return Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1)
}
