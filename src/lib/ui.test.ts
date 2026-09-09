import { describe, expect, it } from 'vitest'
import { RELATIONS } from './camelot'
import { formatBpm, formatDuration, formatTotal, scoreColor, toleranceColor, toneColor } from './ui'

describe('toneColor', () => {
  it('her ton için bir renk var', () => {
    for (const relation of RELATIONS) {
      expect(toneColor(relation.tone)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('farklı tonlar farklı renkler', () => {
    expect(toneColor('energy')).not.toBe(toneColor('calm'))
    expect(toneColor('risk')).not.toBe(toneColor('neutral'))
  })

  it('ton yoksa nötr renk', () => {
    expect(toneColor(null)).toBe(toneColor('neutral'))
    expect(toneColor(undefined)).toBe(toneColor('neutral'))
  })
})

describe('formatDuration', () => {
  it('dakika:saniye yazar', () => {
    expect(formatDuration(372)).toBe('6:12')
    expect(formatDuration(60)).toBe('1:00')
    expect(formatDuration(5)).toBe('0:05')
  })

  it('bilinmeyen sürede tire', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(0)).toBe('—')
    expect(formatDuration(Number.NaN)).toBe('—')
  })
})

describe('formatTotal', () => {
  it('saat ve dakikayı ayırır', () => {
    expect(formatTotal(5040)).toBe('1 h 24 min')
    expect(formatTotal(1800)).toBe('30 min')
    expect(formatTotal(0)).toBe('0 min')
  })
})

describe('formatBpm', () => {
  it('tam sayıda ondalık göstermez', () => {
    expect(formatBpm(124)).toBe('124')
    expect(formatBpm(128.02)).toBe('128.0')
    expect(formatBpm(122.5)).toBe('122.5')
  })

  it('bilinmeyen tempoda tire', () => {
    expect(formatBpm(null)).toBe('—')
    expect(formatBpm(undefined)).toBe('—')
  })
})

describe('scoreColor', () => {
  it('puan yükseldikçe renk değişir', () => {
    const strong = scoreColor(92)
    const weak = scoreColor(20)
    expect(strong).not.toBe(weak)
    expect(strong).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('eşik değerleri üstteki basamağa girer', () => {
    expect(scoreColor(85)).toBe(scoreColor(100))
    expect(scoreColor(84.9)).not.toBe(scoreColor(85))
    expect(scoreColor(40)).not.toBe(scoreColor(39))
  })

  it('sayı olmayan puanda nötr renk', () => {
    expect(scoreColor(null)).toBe(toneColor('neutral'))
    expect(scoreColor(Number.NaN)).toBe(toneColor('neutral'))
  })

  it('aynı puan aynı rengi verir', () => {
    expect(scoreColor(63)).toBe(scoreColor(63))
  })
})

describe('toleranceColor', () => {
  it('tolerans genişledikçe renk değişir', () => {
    expect(toleranceColor(3)).not.toBe(toleranceColor(12))
    expect(toleranceColor(3)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('basamak sınırı alttaki renge ait', () => {
    expect(toleranceColor(6)).toBe(toleranceColor(4))
    expect(toleranceColor(6.1)).not.toBe(toleranceColor(6))
  })

  it('bütün hazır basamaklar farklı renk alır', () => {
    const colors = [3, 6, 8, 10, 12].map(toleranceColor)
    expect(new Set(colors).size).toBe(5)
  })

  it('sayı olmayan değerde nötr renk', () => {
    expect(toleranceColor(null)).toBe(toneColor('neutral'))
  })
})
