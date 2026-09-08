import { describe, expect, it } from 'vitest'
import { isAppState } from './state'

const valid = { setlists: [], library: [], savedAt: 1 }

describe('isAppState', () => {
  it('iskeleti doğrular', () => {
    expect(isAppState(valid)).toBe(true)
  })

  it('eksik ya da yanlış tipli alanları reddeder', () => {
    expect(isAppState(null)).toBe(false)
    expect(isAppState(undefined)).toBe(false)
    expect(isAppState('metin')).toBe(false)
    expect(isAppState(42)).toBe(false)
    expect(isAppState([])).toBe(false)
    expect(isAppState({})).toBe(false)
    expect(isAppState({ ...valid, setlists: 'yok' })).toBe(false)
    expect(isAppState({ ...valid, library: null })).toBe(false)
    expect(isAppState({ ...valid, savedAt: '1' })).toBe(false)
  })
})
