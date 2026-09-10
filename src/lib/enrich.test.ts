import { describe, expect, it } from 'vitest'
import { lookupQuery, pickHit, primaryArtist, titleOverlap, toTrack } from './enrich'
import type { SongHit } from './getsongbpm'
import type { ChartEntry } from './tracklists'

function entry(partial: Partial<ChartEntry> = {}): ChartEntry {
  return { id: 'abc', rank: 1, artist: 'MEDUZA', title: '7 Days', label: null, support: 80, ...partial }
}

function hit(partial: Partial<SongHit> = {}): SongHit {
  return { title: '7 Days', artist: 'MEDUZA', bpm: 124, key: '8A', ...partial }
}

describe('primaryArtist', () => {
  it('ilk sanatçıyı alır', () => {
    expect(primaryArtist('MEDUZA & Kevin de Vries')).toBe('MEDUZA')
    expect(primaryArtist('Lucas, Steve, Mike Bond')).toBe('Lucas')
    expect(primaryArtist('Kiko feat. Ayla')).toBe('Kiko')
    expect(primaryArtist('Above & Beyond x Seven Lions')).toBe('Above')
  })

  it('tek sanatçıyı bozmadan bırakır', () => {
    expect(primaryArtist('Adam Beyer')).toBe('Adam Beyer')
    expect(primaryArtist('')).toBe('')
  })
})

describe('lookupQuery', () => {
  it('sorguyu tek sanatçı ile kurar', () => {
    expect(lookupQuery({ artist: 'MEDUZA & Kevin de Vries', title: '7 Days' })).toBe('MEDUZA - 7 Days')
  })

  it('sanatçı yoksa yalnızca başlığı sorar', () => {
    expect(lookupQuery({ artist: '', title: 'Voicemail' })).toBe('Voicemail')
  })
})

describe('titleOverlap', () => {
  it('aynı başlıkta tam örtüşme', () => {
    expect(titleOverlap('7 Days', '7 Days')).toBe(1)
  })

  it('remix eki örtüşmeyi bozmaz', () => {
    expect(titleOverlap('Voicemail', 'Voicemail (Tiësto Remix)')).toBe(1)
  })

  it('alakasız başlıkta sıfır', () => {
    expect(titleOverlap('7 Days', 'Let Loose')).toBe(0)
  })

  it('boş başlıkta sıfır, çökmez', () => {
    expect(titleOverlap('', 'Gece')).toBe(0)
    expect(titleOverlap('Gece', '')).toBe(0)
  })
})

describe('pickHit', () => {
  it('doğru kaydı seçer', () => {
    const chosen = pickHit(entry(), [hit({ title: 'Let Loose' }), hit()])
    expect(chosen?.title).toBe('7 Days')
  })

  it('temposu ya da keyi olmayan sonucu almaz', () => {
    expect(pickHit(entry(), [hit({ bpm: null })])).toBeNull()
    expect(pickHit(entry(), [hit({ key: null })])).toBeNull()
  })

  it('başlığı tutmayan sonucu reddeder', () => {
    expect(pickHit(entry(), [hit({ title: 'Bambaşka Bir Parça' })])).toBeNull()
  })

  it('aynı başlıkta sanatçısı tutanı yeğler', () => {
    const chosen = pickHit(entry({ artist: 'MEDUZA & Kevin de Vries' }), [
      hit({ artist: 'Başka Biri' }),
      hit({ artist: 'MEDUZA', bpm: 126 }),
    ])
    expect(chosen?.bpm).toBe(126)
  })

  it('boş sonuç listesinde null döner', () => {
    expect(pickHit(entry(), [])).toBeNull()
  })

  it('aynı girdi aynı seçimi verir', () => {
    const hits = [hit({ bpm: 120 }), hit({ bpm: 126, artist: 'MEDUZA' })]
    expect(pickHit(entry(), hits)).toEqual(pickHit(entry(), hits))
  })
})

describe('toTrack', () => {
  it('listedeki tam künyeyi, servisin tempo ve keyini birleştirir', () => {
    const built = toTrack(entry({ artist: 'MEDUZA & Kevin de Vries' }), hit({ artist: 'MEDUZA', bpm: 124, key: '8A' }))
    expect(built).toEqual({
      id: 'tl:abc',
      title: '7 Days',
      artist: 'MEDUZA & Kevin de Vries',
      bpm: 124,
      key: '8A',
      source: 'catalog',
    })
  })

  it('künye boşsa servisin sanatçısına düşer', () => {
    expect(toTrack(entry({ artist: '' }), hit({ artist: 'MEDUZA' })).artist).toBe('MEDUZA')
  })
})
