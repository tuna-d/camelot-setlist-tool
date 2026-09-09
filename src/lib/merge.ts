import type { AppState, Playlist, Setlist, Track } from './types'

function byId<T extends { id: string }>(mine: T[], theirs: T[]): T[] {
  const seen = new Set(mine.map((item) => item.id))
  return [...mine, ...theirs.filter((item) => !seen.has(item.id))]
}

function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name
  let candidate = `${name} (moved)`
  let counter = 2
  while (taken.has(candidate)) {
    candidate = `${name} (moved ${counter})`
    counter += 1
  }
  return candidate
}

function uniqueId(id: string, taken: Set<string>): string {
  if (!taken.has(id)) return id
  let counter = 2
  while (taken.has(`${id}-${counter}`)) counter += 1
  return `${id}-${counter}`
}

/**
 * Adds guest work **on top of** the account record.
 * Account setlists are never removed; moved sets are appended at the end.
 */
export function mergeGuestWork(account: AppState, guest: AppState): AppState {
  const ids = new Set(account.setlists.map((setlist) => setlist.id))
  const names = new Set(account.setlists.map((setlist) => setlist.name))

  const moved: Setlist[] = []
  for (const setlist of guest.setlists) {
    // An empty set is not worth moving; it would just clutter the account.
    if (setlist.entries.length === 0) continue

    const id = uniqueId(setlist.id, ids)
    const name = uniqueName(setlist.name, names)
    ids.add(id)
    names.add(name)
    moved.push({ ...setlist, id, name })
  }

  const library: Track[] = byId(account.library, guest.library)
  const extras: Track[] = byId(account.extras, guest.extras)
  const playlists: Playlist[] = byId(account.playlists, guest.playlists)
  const setlists = [...account.setlists, ...moved]

  return {
    ...account,
    library,
    extras,
    playlists,
    setlists,
    // Surface the moved set so the user can see the move happened.
    activeId: moved.length > 0 ? moved[0].id : account.activeId,
    cursor: moved.length > 0 ? 0 : account.cursor,
    savedAt: Date.now(),
  }
}
