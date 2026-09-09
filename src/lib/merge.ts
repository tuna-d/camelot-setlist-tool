import type { AppState, Playlist, Setlist, Track } from './types'

function byId<T extends { id: string }>(mine: T[], theirs: T[]): T[] {
  const seen = new Set(mine.map((item) => item.id))
  return [...mine, ...theirs.filter((item) => !seen.has(item.id))]
}

function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name
  let candidate = `${name} (taşınan)`
  let counter = 2
  while (taken.has(candidate)) {
    candidate = `${name} (taşınan ${counter})`
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
 * Misafirken yapılan çalışmayı hesaptaki kaydın **üstüne** ekler.
 * Hesaptaki setler hiçbir koşulda silinmez; taşınan setler sona eklenir.
 */
export function mergeGuestWork(account: AppState, guest: AppState): AppState {
  const ids = new Set(account.setlists.map((setlist) => setlist.id))
  const names = new Set(account.setlists.map((setlist) => setlist.name))

  const moved: Setlist[] = []
  for (const setlist of guest.setlists) {
    // Boş set taşımaya değmez; hesabı gereksiz yere kalabalıklaştırır.
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
    // Taşınan set öne çıksın: kullanıcı taşımanın olduğunu görsün.
    activeId: moved.length > 0 ? moved[0].id : account.activeId,
    cursor: moved.length > 0 ? 0 : account.cursor,
    savedAt: Date.now(),
  }
}
