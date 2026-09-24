import { trackKey } from './suggest'
import type { Setlist, Track } from './types'

/**
 * "Seen before": which of the DJ's other sets a track already appears in, so the
 * same song is not bought twice. Read from sets rather than the library, see
 * docs/adr/0002.
 */

export interface SeenIndex {
  /** Set names in the order the sets are kept. */
  names: readonly string[]
  /** Track id or artist + title signature → positions in `names`, ascending. */
  sets: ReadonlyMap<string, readonly number[]>
}

const UNTITLED = 'Untitled set'

/**
 * Only a song with a title gets a signature: two blank manual entries would
 * otherwise share `|` and badge each other.
 */
function signature(track: Track): string | null {
  const key = trackKey(track)
  return key.endsWith('|') ? null : key
}

function readName(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : UNTITLED
}

export function buildSeenIndex(
  setlists: readonly Setlist[],
  activeId: string | null,
  resolve: (id: string) => Track | null,
): SeenIndex {
  const names: string[] = []
  const sets = new Map<string, number[]>()
  if (!Array.isArray(setlists)) return { names, sets }

  // Sets come back from localStorage and the database, so each field is checked.
  for (const setlist of setlists as unknown[]) {
    if (!setlist || typeof setlist !== 'object') continue
    const record = setlist as Record<string, unknown>
    if (record.id === activeId || !Array.isArray(record.entries)) continue

    const position = names.length
    names.push(readName(record.name))
    for (const entry of record.entries as unknown[]) {
      if (!entry || typeof entry !== 'object') continue
      const id = (entry as Record<string, unknown>).trackId
      if (typeof id !== 'string' || !id) continue

      const track = resolve(id)
      const keys = [id, track ? signature(track) : null]
      for (const key of keys) {
        if (key === null) continue
        const found = sets.get(key)
        if (!found) sets.set(key, [position])
        else if (found[found.length - 1] !== position) found.push(position)
      }
    }
  }
  return { names, sets }
}

/** Names of the other sets the track appears in, in set order; empty when none. */
export function seenIn(index: SeenIndex, track: Track): string[] {
  const positions = new Set(index.sets.get(track.id))
  const key = signature(track)
  if (key !== null) for (const position of index.sets.get(key) ?? []) positions.add(position)
  return [...positions].sort((a, b) => a - b).map((position) => index.names[position])
}
