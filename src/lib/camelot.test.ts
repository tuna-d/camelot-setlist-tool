import { describe, expect, it } from 'vitest'
import {
  ALL_KEYS,
  DEFAULT_RELATIONS,
  NOTE_NAME,
  RELATIONS,
  compatibleKeys,
  keyColor,
  keyLabel,
  keyLetter,
  keyNumber,
  relation,
  relationInfo,
  toCamelot,
  wrap12,
} from './camelot'

function pitchOf(noteName: string): number {
  const parsed = /^([A-G])([#b]?)(m?)$/.exec(noteName)
  if (!parsed) throw new Error(`nota adı çözülemedi: ${noteName}`)
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  const shift = parsed[2] === '#' ? 1 : parsed[2] === 'b' ? -1 : 0
  return (base[parsed[1]] + shift + 12) % 12
}

function semitoneGap(from: string, to: string): number {
  return (pitchOf(NOTE_NAME[to]) - pitchOf(NOTE_NAME[from]) + 12) % 12
}

describe('wrap12', () => {
  it('çemberin başında ve sonunda sarar', () => {
    expect(wrap12(13)).toBe(1)
    expect(wrap12(0)).toBe(12)
    expect(wrap12(-1)).toBe(11)
    expect(wrap12(25)).toBe(1)
    expect(wrap12(8)).toBe(8)
  })
})

describe('ilişkilerin yarım ton karşılığı', () => {
  const expectedGap: Record<string, number> = {
    same: 0,
    up: 7,
    down: 5,
    boost: 2,
    semiUp: 1,
    semiDown: 11,
  }

  it('aynı halkadaki her ilişki beklenen yarım ton farkını veriyor', () => {
    let checked = 0
    for (const from of ALL_KEYS) {
      for (const to of ALL_KEYS) {
        const id = relation(from, to)
        if (!id || keyLetter(from) !== keyLetter(to)) continue
        expect(semitoneGap(from, to), `${from} → ${to} (${id})`).toBe(expectedGap[id])
        checked += 1
      }
    }
    expect(checked).toBe(144)
  })

  it('semiUp gerçekten +1, up gerçekten +7 yarım ton', () => {
    expect(semitoneGap('8A', '3A')).toBe(1)
    expect(relation('8A', '3A')).toBe('semiUp')
    expect(semitoneGap('8A', '9A')).toBe(7)
    expect(relation('8A', '9A')).toBe('up')
  })

  it('relatif geçiş minörden majöre 3 yarım ton yukarı', () => {
    expect(relation('8A', '8B')).toBe('relative')
    expect(semitoneGap('8A', '8B')).toBe(3)
  })
})

describe('toCamelot', () => {
  it('nota adlarını çözer', () => {
    expect(toCamelot('Am')).toBe('8A')
    expect(toCamelot('C')).toBe('8B')
    expect(toCamelot('F#m')).toBe('11A')
    expect(toCamelot('Bb Major')).toBe('6B')
    expect(toCamelot('Ebm')).toBe('2A')
  })

  it('büyük/küçük harf ve boşluk umursamaz', () => {
    expect(toCamelot('G Minor')).toBe('6A')
    expect(toCamelot('g minor')).toBe('6A')
    expect(toCamelot('  Gm  ')).toBe('6A')
    expect(toCamelot('D MAJOR')).toBe('10B')
    expect(toCamelot('8a')).toBe('8A')
  })

  it('Camelot ve ters yazılmış Camelot biçimini kabul eder', () => {
    expect(toCamelot('8A')).toBe('8A')
    expect(toCamelot('A8')).toBe('8A')
    expect(toCamelot('12B')).toBe('12B')
    expect(toCamelot('b12')).toBe('12B')
  })

  it('Open Key biçimini kabul eder', () => {
    expect(toCamelot('1m')).toBe('8A')
    expect(toCamelot('1d')).toBe('8B')
    expect(toCamelot('12m')).toBe('7A')
    expect(toCamelot('6d')).toBe('1B')
  })

  it('unicode diyez ve bemol işaretlerini anlar', () => {
    expect(toCamelot('F♯m')).toBe('11A')
    expect(toCamelot('B♭')).toBe('6B')
  })

  it('her Camelot kodunun nota adı aynı koda geri döner', () => {
    for (const code of ALL_KEYS) {
      expect(toCamelot(NOTE_NAME[code]), code).toBe(code)
      expect(toCamelot(code)).toBe(code)
    }
  })

  it('tanımadığı girdide null döner', () => {
    expect(toCamelot('')).toBeNull()
    expect(toCamelot('   ')).toBeNull()
    expect(toCamelot('H')).toBeNull()
    expect(toCamelot('(((')).toBeNull()
    expect(toCamelot('13A')).toBeNull()
    expect(toCamelot('0A')).toBeNull()
    expect(toCamelot('8C')).toBeNull()
    expect(toCamelot('13m')).toBeNull()
    expect(toCamelot('Cmaj7')).toBeNull()
    expect(toCamelot(null)).toBeNull()
    expect(toCamelot(undefined)).toBeNull()
  })
})

describe('relation', () => {
  it('plandaki 8A hedeflerini birebir veriyor', () => {
    expect(relation('8A', '8A')).toBe('same')
    expect(relation('8A', '9A')).toBe('up')
    expect(relation('8A', '7A')).toBe('down')
    expect(relation('8A', '8B')).toBe('relative')
    expect(relation('8A', '10A')).toBe('boost')
    expect(relation('8A', '9B')).toBe('diagonal')
    expect(relation('8A', '3A')).toBe('semiUp')
    expect(relation('8A', '1A')).toBe('semiDown')
  })

  it('çemberin başında ve sonunda sarar', () => {
    expect(relation('12A', '1A')).toBe('up')
    expect(relation('1A', '12A')).toBe('down')
    expect(relation('12B', '2B')).toBe('boost')
    expect(relation('1A', '8A')).toBe('semiUp')
  })

  it('uyumsuz ve geçersiz girdide null', () => {
    expect(relation('8A', '2A')).toBeNull()
    expect(relation('8A', '11B')).toBeNull()
    expect(relation('8A', null)).toBeNull()
    expect(relation(null, '8A')).toBeNull()
    expect(relation('8A', 'Am')).toBeNull()
    expect(relation('', '')).toBeNull()
  })
})

describe('compatibleKeys', () => {
  it('varsayılan ilişkilerle 8A hedeflerini sırayla verir', () => {
    expect(compatibleKeys('8A', DEFAULT_RELATIONS)).toEqual([
      { code: '8A', relation: 'same' },
      { code: '9A', relation: 'up' },
      { code: '7A', relation: 'down' },
      { code: '8B', relation: 'relative' },
      { code: '10A', relation: 'boost' },
    ])
  })

  it('ürettiği her key gerçekten o ilişkiyi geri veriyor', () => {
    const all = RELATIONS.map((item) => item.id)
    for (const from of ALL_KEYS) {
      for (const target of compatibleKeys(from, all)) {
        expect(relation(from, target.code), `${from} → ${target.code}`).toBe(target.relation)
      }
    }
  })

  it('geçersiz key ya da boş ilişki listesinde boş dizi', () => {
    expect(compatibleKeys('şey', DEFAULT_RELATIONS)).toEqual([])
    expect(compatibleKeys(null, DEFAULT_RELATIONS)).toEqual([])
    expect(compatibleKeys('8A', [])).toEqual([])
  })
})

describe('yardımcılar', () => {
  it('keyNumber ve keyLetter kodu parçalar', () => {
    expect(keyNumber('10B')).toBe(10)
    expect(keyLetter('10B')).toBe('B')
    expect(keyNumber('13A')).toBeNull()
    expect(keyLetter('10C')).toBeNull()
    expect(keyNumber(null)).toBeNull()
  })

  it('keyColor numaraya bağlı ve halkadan bağımsız', () => {
    expect(keyColor('8A')).toBe(keyColor('8B'))
    expect(keyColor('8A')).not.toBe(keyColor('9A'))
    expect(keyColor('şey')).toBe('#6b7280')
    expect(new Set(ALL_KEYS.map(keyColor)).size).toBe(12)
  })

  it('keyLabel kodu ve nota adını birlikte gösterir', () => {
    expect(keyLabel('8A')).toBe('8A · Am')
    expect(keyLabel(null)).toBe('—')
    expect(keyLabel('bilinmeyen')).toBe('bilinmeyen')
  })

  it('RELATIONS tablosu tekil ve eksiksiz', () => {
    expect(RELATIONS).toHaveLength(8)
    expect(new Set(RELATIONS.map((item) => item.id)).size).toBe(8)
    expect(new Set(RELATIONS.map((item) => `${item.offset}/${item.flip}`)).size).toBe(8)
    expect(relationInfo('same')?.score).toBe(100)
    expect(relationInfo('semiDown')?.defaultOn).toBe(false)
  })

  it('ALL_KEYS 24 key içeriyor ve hepsinin nota adı var', () => {
    expect(ALL_KEYS).toHaveLength(24)
    expect(new Set(ALL_KEYS).size).toBe(24)
    for (const code of ALL_KEYS) expect(NOTE_NAME[code]).toBeTruthy()
  })
})
