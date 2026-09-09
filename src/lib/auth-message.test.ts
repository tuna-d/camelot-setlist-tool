import { describe, expect, it } from 'vitest'
import { authMessage } from './auth-message'

describe('authMessage', () => {
  it('bilinen hataları Türkçeye ve yapılacak işe çevirir', () => {
    expect(authMessage({ message: 'Invalid login credentials' })).toMatch(/E-posta ya da parola yanlış/)
    expect(authMessage({ message: 'Email not confirmed' })).toMatch(/gelen bağlantıya tıkla/)
    expect(authMessage({ message: 'User already registered' })).toMatch(/Kayıt yerine giriş yap/)
    expect(authMessage({ message: 'Password should be at least 6 characters' })).toMatch(/en az 6 karakter/i)
    expect(authMessage({ message: 'Unable to validate email address' })).toMatch(/Yazımını kontrol et/)
    expect(authMessage({ message: 'Request rate limit reached' })).toMatch(/birkaç dakika bekleyip/i)
    expect(authMessage({ message: 'Provider is not enabled' })).toMatch(/Providers altından etkinleştir/)
    expect(authMessage({ message: 'Failed to fetch' })).toMatch(/misafir olarak çalışmaya devam/)
  })

  it('tanımadığı hatayı ham metniyle birlikte gösterir', () => {
    expect(authMessage({ message: 'Something odd happened' })).toBe(
      'Giriş yapılamadı: Something odd happened. Tekrar dene ya da başka bir yöntemle gir.',
    )
  })

  it('boş ya da eksik hatada da bir şey söyler', () => {
    expect(authMessage(null)).toMatch(/bilinmeyen bir sorun/)
    expect(authMessage(undefined)).toMatch(/bilinmeyen bir sorun/)
    expect(authMessage({})).toMatch(/bilinmeyen bir sorun/)
    expect(authMessage({ message: '   ' })).toMatch(/bilinmeyen bir sorun/)
  })
})
