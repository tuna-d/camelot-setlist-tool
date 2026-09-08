import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOLERANCE,
  bpmDelta,
  bpmRange,
  formatDelta,
  groupByRelation,
  normalizeTitle,
  scoreCandidate,
  suggest,
  trackKey,
} from './suggest'
import type { Track } from './types'

function track(partial: Partial<Track> & { id: string }): Track {
  return {
    title: `Parça ${partial.id}`,
    artist: 'Sanatçı',
    bpm: 124,
    key: '8A',
    source: 'library',
    ...partial,
  }
}

const ref = track({ id: 'ref', title: 'Referans', bpm: 124, key: '8A' })
const allRelations = ['same', 'up', 'down', 'relative', 'boost', 'diagonal', 'semiUp', 'semiDown'] as const

describe('bpmDelta', () => {
  it('işareti korur', () => {
    expect(bpmDelta(124, 126).signed).toBe(2)
    expect(bpmDelta(124, 122.5).signed).toBe(-1.5)
    expect(bpmDelta(124, 124).abs).toBe(0)
  })

  it('yarım ve çift tempoyu yakalar', () => {
    expect(bpmDelta(128, 64)).toMatchObject({ abs: 0, halved: true, matched: 128 })
    expect(bpmDelta(128, 256)).toMatchObject({ abs: 0, halved: true, matched: 128 })
    expect(bpmDelta(128, 130)).toMatchObject({ abs: 2, halved: false })
  })

  it('yarım tempoda da işaret doğru', () => {
    // 63 BPM'lik aday ikiye katlanınca 126: referanstan 2 hızlı.
    expect(bpmDelta(124, 63).signed).toBe(2)
  })
})

describe('formatDelta', () => {
  it('tam, artı ve eksi biçimleri', () => {
    expect(formatDelta(bpmDelta(124, 124))).toBe('tam')
    expect(formatDelta(bpmDelta(124, 126))).toBe('+2.0')
    expect(formatDelta(bpmDelta(124, 122.5))).toBe('−1.5')
  })

  it('yuvarlama sonrası sıfır da tam sayılır', () => {
    expect(formatDelta(0.02)).toBe('tam')
    expect(formatDelta(-0.02)).toBe('tam')
  })
})

describe('bpmRange', () => {
  it('toleransı yüzde olarak uygular', () => {
    expect(bpmRange(120, 5)).toEqual({ min: 114, max: 126 })
  })
})

describe('normalizeTitle ve trackKey', () => {
  it('sürüm etiketini ve feat. ekini atar', () => {
    expect(normalizeTitle('Gece Yürüyüşü (Original Mix)')).toBe('gece yürüyüşü')
    expect(normalizeTitle('Gece Yürüyüşü (Extended Mix)')).toBe('gece yürüyüşü')
    expect(normalizeTitle('Gece Yürüyüşü feat. Ayla')).toBe('gece yürüyüşü')
    expect(normalizeTitle("Becca's Booty")).toBe('becca s booty')
  })

  it('remix adını korur — remix ayrı bir parçadır', () => {
    expect(normalizeTitle('Gece (Tale Of Us Remix)')).not.toBe(normalizeTitle('Gece'))
  })

  it('aynı parçanın farklı yazımları aynı imzayı verir', () => {
    const a = track({ id: '1', title: 'Kum Saati (Original Mix)', artist: 'Deniz K.' })
    const b = track({ id: '2', title: 'Kum saati', artist: 'Deniz K' })
    expect(trackKey(a)).toBe(trackKey(b))
  })
})

describe('scoreCandidate', () => {
  it('aynı tempoda daha iyi ilişki daha yüksek puan alır', () => {
    const same = scoreCandidate(ref, track({ id: 'a', key: '8A' }), DEFAULT_TOLERANCE, [...allRelations])
    const up = scoreCandidate(ref, track({ id: 'b', key: '9A' }), DEFAULT_TOLERANCE, [...allRelations])
    const boost = scoreCandidate(ref, track({ id: 'c', key: '10A' }), DEFAULT_TOLERANCE, [...allRelations])
    expect(same!.score).toBeGreaterThan(up!.score)
    expect(up!.score).toBeGreaterThan(boost!.score)
  })

  it('aynı ilişkide tempo uzaklaştıkça puan düşer', () => {
    const close = scoreCandidate(ref, track({ id: 'a', bpm: 124.5 }), DEFAULT_TOLERANCE, ['same'])
    const far = scoreCandidate(ref, track({ id: 'b', bpm: 128 }), DEFAULT_TOLERANCE, ['same'])
    expect(close!.score).toBeGreaterThan(far!.score)
  })

  it('tolerans dışındaki tempoyu eler', () => {
    // %6 tolerans → 124 ± 7.44
    expect(scoreCandidate(ref, track({ id: 'a', bpm: 131 }), 6, ['same'])).not.toBeNull()
    expect(scoreCandidate(ref, track({ id: 'b', bpm: 132 }), 6, ['same'])).toBeNull()
  })

  it('kapalı ilişkiyi eler', () => {
    expect(scoreCandidate(ref, track({ id: 'a', key: '9A' }), 6, ['same'])).toBeNull()
    expect(scoreCandidate(ref, track({ id: 'b', key: '2A' }), 6, [...allRelations])).toBeNull()
  })

  it('tempo ya da key eksikse eler', () => {
    expect(scoreCandidate(ref, track({ id: 'a', bpm: null }), 6, ['same'])).toBeNull()
    expect(scoreCandidate(ref, track({ id: 'b', key: null }), 6, ['same'])).toBeNull()
    expect(scoreCandidate(track({ id: 'r', bpm: null }), track({ id: 'c' }), 6, ['same'])).toBeNull()
  })

  it('yarım tempolu aday tolerans içinde sayılır', () => {
    const half = scoreCandidate(ref, track({ id: 'a', bpm: 62 }), 6, ['same'])
    expect(half?.delta.halved).toBe(true)
  })
})

describe('suggest', () => {
  const pool = [
    track({ id: '1', title: 'Aynı', key: '8A', bpm: 124 }),
    track({ id: '2', title: 'Yukarı', key: '9A', bpm: 124 }),
    track({ id: '3', title: 'Uzak tempo', key: '8A', bpm: 129 }),
    track({ id: '4', title: 'Uyumsuz', key: '2A', bpm: 124 }),
    track({ id: '5', title: 'Tolerans dışı', key: '8A', bpm: 140 }),
  ]

  it('puana göre sıralı döner', () => {
    // Tempoyu tam tutturan "+1" (96.0), tempoyu 5 BPM kaçıran "aynı key"i (77.2) geçiyor:
    // ağırlıklar key'den yana ama tempo farkı da gerçekten tartıyor.
    const list = suggest(ref, pool, { tolerance: 6, relations: [...allRelations] })
    expect(list.map((item) => item.track.id)).toEqual(['1', '2', '3'])
  })

  it('limit uygular', () => {
    const list = suggest(ref, pool, { tolerance: 6, relations: [...allRelations], limit: 2 })
    expect(list).toHaveLength(2)
  })

  it('exclude kümesindeki parçayı ve kendisini atar', () => {
    const list = suggest(ref, [...pool, ref], {
      tolerance: 6,
      relations: [...allRelations],
      exclude: new Set(['1']),
    })
    expect(list.map((item) => item.track.id)).not.toContain('1')
    expect(list.map((item) => item.track.id)).not.toContain('ref')
  })

  it('imzası aynı olan kopyayı bir kez gösterir', () => {
    const twin = track({ id: '99', title: 'Aynı (Original Mix)', key: '8A', bpm: 124 })
    const list = suggest(ref, [...pool, twin], { tolerance: 6, relations: [...allRelations] })
    expect(list.filter((item) => item.track.title.startsWith('Aynı'))).toHaveLength(1)
  })

  it('tür süzgeci uygular ama türü olmayan parçayı elemez', () => {
    const withGenres = [
      track({ id: 'a', key: '8A', genre: 'Tech House' }),
      track({ id: 'b', key: '8A', genre: 'Drum & Bass' }),
      track({ id: 'c', key: '8A' }),
    ]
    const list = suggest(ref, withGenres, {
      tolerance: 6,
      relations: ['same'],
      genres: ['Tech House'],
    })
    expect(list.map((item) => item.track.id)).toEqual(['a', 'c'])
  })

  it('tür eşleşmesi kısmi metinle de çalışır', () => {
    const list = suggest(ref, [track({ id: 'a', key: '8A', genre: 'Techno (Peak Time / Driving)' })], {
      tolerance: 6,
      relations: ['same'],
      genres: ['Techno'],
    })
    expect(list).toHaveLength(1)
  })

  it('boş havuzda boş liste', () => {
    expect(suggest(ref, [], { tolerance: 6, relations: [...allRelations] })).toEqual([])
  })

  it('referansın tempo ya da keyi yoksa öneri yok', () => {
    expect(suggest(track({ id: 'r', key: null }), pool, { tolerance: 6, relations: ['same'] })).toEqual([])
  })

  it('aynı girdi aynı sırayı verir', () => {
    const first = suggest(ref, pool, { tolerance: 6, relations: [...allRelations] })
    const second = suggest(ref, pool, { tolerance: 6, relations: [...allRelations] })
    expect(second.map((item) => item.track.id)).toEqual(first.map((item) => item.track.id))
  })
})

describe('groupByRelation', () => {
  it('RELATIONS sırasını korur ve boş grubu atar', () => {
    const list = suggest(
      ref,
      [
        track({ id: '1', key: '10A' }),
        track({ id: '2', key: '8A' }),
        track({ id: '3', key: '9A' }),
      ],
      { tolerance: 6, relations: ['same', 'up', 'boost', 'down'] },
    )
    expect(groupByRelation(list).map((group) => group.info.id)).toEqual(['same', 'up', 'boost'])
  })

  it('boş listede boş dizi', () => {
    expect(groupByRelation([])).toEqual([])
  })
})
