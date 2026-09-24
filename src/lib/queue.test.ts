import { describe, expect, it } from 'vitest'
import { advanceQueue, EMPTY_QUEUE, queueView } from './queue'
import type { QueueState } from './queue'

function press(ids: string[], state: QueueState, times = 1): QueueState {
  let next = state
  for (let i = 0; i < times; i++) next = advanceQueue(ids, next)
  return next
}

describe('queueView', () => {
  it('basmadan önce sırada ilk parça durur', () => {
    const view = queueView(['a', 'b', 'c'], EMPTY_QUEUE)
    expect(view).toEqual({ next: 'a', nextIndex: 0, openedCount: 0, total: 3, finished: false })
  })

  it('setten çıkmış ya da çelişkili kayıtlarla çökmez, ilk açılmamışa düşer', () => {
    const stale = { opened: ['x', 'y'], reached: 'y' }
    expect(queueView(['a', 'b'], stale)).toMatchObject({ next: 'a', nextIndex: 0, openedCount: 0 })
    const contradictory = { opened: ['a'], reached: 'a' }
    expect(queueView(['a', 'b'], contradictory)).toMatchObject({ next: 'b', openedCount: 1 })
  })

  it('boş sette açılacak bir şey yok ve geçiş bitmiş sayılmaz', () => {
    expect(queueView([], EMPTY_QUEUE)).toEqual({
      next: null,
      nextIndex: -1,
      openedCount: 0,
      total: 0,
      finished: false,
    })
    expect(advanceQueue([], EMPTY_QUEUE)).toEqual(EMPTY_QUEUE)
  })
})

describe('advanceQueue', () => {
  it('her basışta bir parça ilerler', () => {
    const ids = ['a', 'b', 'c']
    const once = press(ids, EMPTY_QUEUE)
    expect(queueView(ids, once)).toMatchObject({ next: 'b', nextIndex: 1, openedCount: 1 })
    const twice = press(ids, once)
    expect(queueView(ids, twice)).toMatchObject({ next: 'c', nextIndex: 2, openedCount: 2 })
  })

  it('setin sonunda bittiğini söyler ve daha fazla ilerlemez', () => {
    const ids = ['a', 'b']
    const done = press(ids, EMPTY_QUEUE, 2)
    expect(queueView(ids, done)).toEqual({
      next: null,
      nextIndex: -1,
      openedCount: 2,
      total: 2,
      finished: true,
    })
    expect(advanceQueue(ids, done)).toEqual(done)
  })

  it('açılan parça silinince ardından geleni gösterir', () => {
    const state = press(['a', 'b', 'c'], EMPTY_QUEUE)
    expect(queueView(['b', 'c'], state)).toMatchObject({ next: 'b', nextIndex: 0, openedCount: 0 })
  })

  it('sıradaki parça silinince ilk açılmamış parçaya geçer', () => {
    const state = press(['a', 'b', 'c'], EMPTY_QUEUE)
    expect(queueView(['a', 'c'], state)).toMatchObject({ next: 'c', nextIndex: 1, openedCount: 1 })
  })

  it('sıra değişince aynı parçada kalır', () => {
    const state = press(['a', 'b', 'c', 'd'], EMPTY_QUEUE)
    // 'b' is the one reached; drag it to the end.
    const reordered = ['a', 'c', 'd', 'b']
    expect(queueView(reordered, state)).toMatchObject({ next: 'b', nextIndex: 3, openedCount: 1 })
  })

  it('sıra değiştikten sonra açılmamış parçaları atlamaz', () => {
    const state = press(['a', 'b', 'c'], EMPTY_QUEUE)
    // 'c' dragged above the opened 'a': the pass must still reach it.
    const reordered = ['c', 'a', 'b']
    const after = press(reordered, state)
    expect(queueView(reordered, after)).toMatchObject({ next: 'c', nextIndex: 0, openedCount: 2 })
    const done = press(reordered, after)
    expect(queueView(reordered, done).finished).toBe(true)
  })

  it('aynı parça iki kez varsa bir basış ikisini de açılmış sayar', () => {
    const ids = ['a', 'b', 'a']
    const state = press(ids, EMPTY_QUEUE)
    expect(queueView(ids, state)).toMatchObject({ next: 'b', openedCount: 2, total: 3 })
    expect(queueView(ids, press(ids, state)).finished).toBe(true)
  })

  it('aynı girdiye aynı çıktıyı verir ve durumu değiştirmez', () => {
    const ids = ['a', 'b', 'c']
    const state = press(ids, EMPTY_QUEUE)
    const snapshot = JSON.stringify(state)
    expect(advanceQueue(ids, state)).toEqual(advanceQueue(ids, state))
    expect(queueView(ids, state)).toEqual(queueView(ids, state))
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})
