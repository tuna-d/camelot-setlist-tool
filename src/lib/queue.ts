/**
 * The YouTube pass: working down a set one track per press.
 *
 * Positions are never stored. The queue remembers track ids — the one it has
 * reached and the ones already opened — so removing or dragging entries about
 * does not lose the place.
 */

export interface QueueState {
  /** Ids opened in this pass, oldest first. */
  opened: readonly string[]
  /** The id the pass has reached; null before the first press. */
  reached: string | null
}

export interface QueueView {
  /** The id the next press opens; null when there is nothing left. */
  next: string | null
  /** Where `next` sits in the set, -1 when there is none. */
  nextIndex: number
  /** How many entries of the set have been opened. */
  openedCount: number
  total: number
  /** Every entry has been opened. An empty set is never finished. */
  finished: boolean
}

export const EMPTY_QUEUE: QueueState = { opened: [], reached: null }

function firstUnopened(ids: readonly string[], opened: ReadonlySet<string>, from = 0): number {
  for (let i = from; i < ids.length; i++) {
    if (!opened.has(ids[i])) return i
  }
  return -1
}

export function queueView(ids: readonly string[], state: QueueState): QueueView {
  const opened = new Set(state.opened)
  const reachedIndex =
    state.reached !== null && !opened.has(state.reached) ? ids.indexOf(state.reached) : -1
  // A reached track that left the set hands over to whatever is still unopened.
  const nextIndex = reachedIndex >= 0 ? reachedIndex : firstUnopened(ids, opened)
  const openedCount = ids.filter((id) => opened.has(id)).length

  return {
    next: nextIndex >= 0 ? ids[nextIndex] : null,
    nextIndex,
    openedCount,
    total: ids.length,
    finished: ids.length > 0 && openedCount === ids.length,
  }
}

/**
 * The state after the next track has been opened. The caller opens the tab itself,
 * so this stays pure and one press can never open two.
 */
export function advanceQueue(ids: readonly string[], state: QueueState): QueueState {
  const { next, nextIndex } = queueView(ids, state)
  if (next === null) return state

  const opened = [...state.opened, next]
  const openedSet = new Set(opened)
  // Carry on down the list; wrap round only for tracks a drag moved above the pass.
  let reachedIndex = firstUnopened(ids, openedSet, nextIndex + 1)
  if (reachedIndex < 0) reachedIndex = firstUnopened(ids, openedSet)

  return { opened, reached: reachedIndex >= 0 ? ids[reachedIndex] : null }
}
