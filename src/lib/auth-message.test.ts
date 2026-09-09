import { describe, expect, it } from 'vitest'
import { authMessage } from './auth-message'

describe('authMessage', () => {
  it('bilinen hataları Türkçeye ve yapılacak işe çevirir', () => {
    expect(authMessage({ message: 'Invalid login credentials' })).toMatch(/Wrong email or password/)
    expect(authMessage({ message: 'Email not confirmed' })).toMatch(/Click the link in your inbox/)
    expect(authMessage({ message: 'User already registered' })).toMatch(/Sign in instead/)
    expect(authMessage({ message: 'Password should be at least 6 characters' })).toMatch(/at least 6 characters/i)
    expect(authMessage({ message: 'Unable to validate email address' })).toMatch(/Check the spelling/)
    expect(authMessage({ message: 'Request rate limit reached' })).toMatch(/wait a few minutes/i)
    expect(authMessage({ message: 'Provider is not enabled' })).toMatch(/Authentication → Providers/)
    expect(authMessage({ message: 'Failed to fetch' })).toMatch(/keep working as a guest/)
  })

  it('tanımadığı hatayı ham metniyle birlikte gösterir', () => {
    expect(authMessage({ message: 'Something odd happened' })).toBe(
      'Could not sign in: Something odd happened. Try again or use another method.',
    )
  })

  it('boş ya da eksik hatada da bir şey söyler', () => {
    expect(authMessage(null)).toMatch(/Something unknown went wrong/)
    expect(authMessage(undefined)).toMatch(/Something unknown went wrong/)
    expect(authMessage({})).toMatch(/Something unknown went wrong/)
    expect(authMessage({ message: '   ' })).toMatch(/Something unknown went wrong/)
  })
})
