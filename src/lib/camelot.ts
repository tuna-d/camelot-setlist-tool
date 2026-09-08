import type { RelationId, Tone } from './types'

export const NOTE_NAME: Record<string, string> = {
  '1A': 'Abm',
  '1B': 'B',
  '2A': 'Ebm',
  '2B': 'F#',
  '3A': 'Bbm',
  '3B': 'Db',
  '4A': 'Fm',
  '4B': 'Ab',
  '5A': 'Cm',
  '5B': 'Eb',
  '6A': 'Gm',
  '6B': 'Bb',
  '7A': 'Dm',
  '7B': 'F',
  '8A': 'Am',
  '8B': 'C',
  '9A': 'Em',
  '9B': 'G',
  '10A': 'Bm',
  '10B': 'D',
  '11A': 'F#m',
  '11B': 'A',
  '12A': 'C#m',
  '12B': 'E',
}

export const ALL_KEYS: string[] = Array.from({ length: 12 }, (_, i) => [
  `${i + 1}A`,
  `${i + 1}B`,
]).flat()

export function wrap12(n: number): number {
  return ((((n - 1) % 12) + 12) % 12) + 1
}

const KEY_COLORS: Record<number, string> = {
  1: '#5cb4e0',
  2: '#5c72e0',
  3: '#885ce0',
  4: '#ca5ce0',
  5: '#e05cb4',
  6: '#e05c72',
  7: '#e0885c',
  8: '#e0ca5c',
  9: '#b4e05c',
  10: '#72e05c',
  11: '#5ce088',
  12: '#5ce0ca',
}

const NOTE_PITCH: Record<string, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
}

const MINOR_WORDS = new Set(['m', 'min', 'minor', 'moll'])
const MAJOR_WORDS = new Set(['', 'maj', 'major', 'dur'])

function fromParts(number: number, letter: 'A' | 'B'): string | null {
  if (!Number.isInteger(number) || number < 1 || number > 12) return null
  return `${number}${letter}`
}

// One step on the wheel is a fifth (7 semitones), so 7 is its own inverse mod 12.
function numberFromPitch(pitch: number, minor: boolean): number {
  const base = minor ? pitch - 9 : pitch
  return wrap12(8 + 7 * base)
}

export function toCamelot(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text) return null

  const camelot = /^(\d{1,2})\s*([ab])$/i.exec(text)
  if (camelot) return fromParts(Number(camelot[1]), camelot[2].toUpperCase() as 'A' | 'B')

  const reversed = /^([ab])\s*(\d{1,2})$/i.exec(text)
  if (reversed) return fromParts(Number(reversed[2]), reversed[1].toUpperCase() as 'A' | 'B')

  const openKey = /^(\d{1,2})\s*([md])$/i.exec(text)
  if (openKey) {
    const n = Number(openKey[1])
    if (n < 1 || n > 12) return null
    return fromParts(wrap12(n + 7), openKey[2].toLowerCase() === 'm' ? 'A' : 'B')
  }

  const note = /^([a-g])\s*([#♯b♭]?)\s*(.*)$/i.exec(text)
  if (!note) return null

  const quality = note[3].trim().toLowerCase().replace(/\./g, '')
  let minor: boolean
  if (MINOR_WORDS.has(quality)) minor = true
  else if (MAJOR_WORDS.has(quality)) minor = false
  else return null

  const accidental = note[2]
  const shift = accidental === '#' || accidental === '♯' ? 1 : accidental ? -1 : 0
  const pitch = (NOTE_PITCH[note[1].toLowerCase()] + shift + 12) % 12
  return fromParts(numberFromPitch(pitch, minor), minor ? 'A' : 'B')
}

export function keyNumber(code: string | null | undefined): number | null {
  if (!code) return null
  const parsed = /^(\d{1,2})([AB])$/.exec(code)
  if (!parsed) return null
  const n = Number(parsed[1])
  return n >= 1 && n <= 12 ? n : null
}

export function keyLetter(code: string | null | undefined): 'A' | 'B' | null {
  if (!code) return null
  const parsed = /^\d{1,2}([AB])$/.exec(code)
  return parsed ? (parsed[1] as 'A' | 'B') : null
}

export interface RelationInfo {
  id: RelationId
  label: string
  hint: string
  score: number
  tone: Tone
  defaultOn: boolean
  offset: number
  flip: boolean
}

export const RELATIONS: RelationInfo[] = [
  {
    id: 'same',
    label: 'Aynı key',
    hint: 'Aynı key — geçiş duyulmaz, en güvenli hamle.',
    score: 100,
    tone: 'neutral',
    defaultOn: true,
    offset: 0,
    flip: false,
  },
  {
    id: 'up',
    label: '+1 · enerji ↑',
    hint: 'Bir numara ileri: enerjiyi yükseltir, pistin gerilimini artırır.',
    score: 94,
    tone: 'energy',
    defaultOn: true,
    offset: 1,
    flip: false,
  },
  {
    id: 'down',
    label: '−1 · yumuşak',
    hint: 'Bir numara geri: gerilimi düşürür, nefes aldırır.',
    score: 92,
    tone: 'calm',
    defaultOn: true,
    offset: 11,
    flip: false,
  },
  {
    id: 'relative',
    label: 'Relatif',
    hint: 'Aynı numaranın diğer halkası: majör/minör değişir, enerji aynı kalır.',
    score: 88,
    tone: 'color',
    defaultOn: true,
    offset: 0,
    flip: true,
  },
  {
    id: 'boost',
    label: '+2 · sıçrama',
    hint: 'İki numara ileri: belirgin enerji sıçraması, sette seyrek kullan.',
    score: 72,
    tone: 'jump',
    defaultOn: true,
    offset: 2,
    flip: false,
  },
  {
    id: 'diagonal',
    label: 'Diyagonal',
    hint: 'Bir numara ileri ve halka değiştir: taze ama riskli, uzun geçişte dene.',
    score: 64,
    tone: 'jump',
    defaultOn: false,
    offset: 1,
    flip: true,
  },
  {
    id: 'semiUp',
    label: '+7 · yarım ton ↑',
    hint: 'Yarım ton yukarı: dikkat çeker, breakte ya da akapella üstünde yap.',
    score: 62,
    tone: 'risk',
    defaultOn: false,
    offset: 7,
    flip: false,
  },
  {
    id: 'semiDown',
    label: '−7 · yarım ton ↓',
    hint: 'Yarım ton aşağı: daha karanlık, enerji düşüşünü göze alıyorsan kullan.',
    score: 56,
    tone: 'risk',
    defaultOn: false,
    offset: 5,
    flip: false,
  },
]

const RELATION_BY_ID = new Map(RELATIONS.map((item) => [item.id, item]))

export function relationInfo(id: RelationId): RelationInfo | null {
  return RELATION_BY_ID.get(id) ?? null
}

export const DEFAULT_RELATIONS: RelationId[] = RELATIONS.filter((item) => item.defaultOn).map(
  (item) => item.id,
)

export function relation(
  from: string | null | undefined,
  to: string | null | undefined,
): RelationId | null {
  const fromNumber = keyNumber(from)
  const toNumber = keyNumber(to)
  const fromLetter = keyLetter(from)
  const toLetter = keyLetter(to)
  if (fromNumber === null || toNumber === null || !fromLetter || !toLetter) return null

  const offset = (((toNumber - fromNumber) % 12) + 12) % 12
  const flip = fromLetter !== toLetter
  const match = RELATIONS.find((item) => item.offset === offset && item.flip === flip)
  return match ? match.id : null
}

export interface CompatibleKey {
  code: string
  relation: RelationId
}

export function compatibleKeys(
  from: string | null | undefined,
  allowed: RelationId[],
): CompatibleKey[] {
  const number = keyNumber(from)
  const letter = keyLetter(from)
  if (number === null || !letter) return []

  const allowedSet = new Set(allowed)
  const other = letter === 'A' ? 'B' : 'A'
  return RELATIONS.filter((item) => allowedSet.has(item.id)).map((item) => ({
    code: `${wrap12(number + item.offset)}${item.flip ? other : letter}`,
    relation: item.id,
  }))
}

export function keyColor(code: string | null | undefined): string {
  const number = keyNumber(code)
  return number === null ? '#6b7280' : KEY_COLORS[number]
}

export function keyLabel(code: string | null | undefined): string {
  if (!code) return '—'
  const name = NOTE_NAME[code]
  return name ? `${code} · ${name}` : code
}
