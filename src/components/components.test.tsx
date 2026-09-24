import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_RELATIONS } from '../lib/camelot'
import { toneColor } from '../lib/ui'
import { Bpm, EnergyStars, KeyChip, TrackLinks, youtubeSearchUrl } from './common'
import { CamelotWheel } from './CamelotWheel'
import { TempoCurve } from './TempoCurve'
import type { Track } from '../lib/types'

const track: Track = {
  id: '1',
  title: "Becca's Booty",
  artist: 'Kaya',
  bpm: 126,
  key: '11A',
  source: 'library',
}

describe('KeyChip', () => {
  it('kod, nota adı ve renk noktası gösterir', () => {
    const html = renderToStaticMarkup(<KeyChip code="8A" />)
    expect(html).toContain('8A')
    expect(html).toContain('Am')
    expect(html).toContain('background:#e0ca5c')
  })

  it('keysiz parçada tire gösterir', () => {
    const html = renderToStaticMarkup(<KeyChip code={null} />)
    expect(html).toContain('—')
    expect(html).toContain('Key bilinmiyor')
  })
})

describe('Bpm', () => {
  it('tabular sınıfıyla yazar', () => {
    expect(renderToStaticMarkup(<Bpm value={128.02} />)).toBe('<span class="bpm">128.0</span>')
    expect(renderToStaticMarkup(<Bpm value={null} />)).toContain('—')
  })
})

describe('TrackLinks', () => {
  it('Beatport ve YouTube aramalarını kurar', () => {
    const html = renderToStaticMarkup(<TrackLinks track={track} />)
    expect(html).toContain('beatport.com/search?q=Kaya%20Becca&#x27;s%20Booty')
    expect(html).toContain('youtube.com/results?search_query=')
  })

  it('arama adresi sanatçı ve başlığı birleştirir', () => {
    expect(youtubeSearchUrl(track)).toBe(
      "https://www.youtube.com/results?search_query=Kaya%20Becca's%20Booty",
    )
  })
})

describe('EnergyStars', () => {
  it('verilen puana kadar dolu yıldız çizer', () => {
    const html = renderToStaticMarkup(<EnergyStars energy={{ level: 3, rated: true }} onChange={() => {}} label="enerji" />)
    expect(html.match(/★/g)).toHaveLength(3)
    expect(html.match(/☆/g)).toHaveLength(2)
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(3)
  })

  it('puan yokken hepsi boş', () => {
    const html = renderToStaticMarkup(
      <EnergyStars energy={null} onChange={() => {}} label="enerji" />,
    )
    expect(html.match(/☆/g)).toHaveLength(5)
    expect(html).not.toContain('aria-pressed="true"')
  })
})

describe('EnergyStars tahmini', () => {
  it('puan yokken tahmini soluk yıldızlarla gösterir, hiçbirini basılı saymaz', () => {
    const html = renderToStaticMarkup(
      <EnergyStars energy={{ level: 4, rated: false }} onChange={() => {}} label="enerji" />,
    )
    expect(html.match(/star star-estimated/g)).toHaveLength(4)
    expect(html.match(/★/g)).toHaveLength(4)
    expect(html).not.toContain('aria-pressed="true"')
    expect(html).toContain('data-energy="estimated"')
    expect(html).toContain('Estimated energy 4/5')
  })

  it('verilen puan dolu ve basılı, soluk değil', () => {
    const html = renderToStaticMarkup(
      <EnergyStars energy={{ level: 2, rated: true }} onChange={() => {}} label="enerji" />,
    )
    expect(html).not.toContain('star-estimated')
    expect(html.match(/★/g)).toHaveLength(2)
    expect(html).toContain('data-energy="rated"')
  })

  it('tahmin de puan da yoksa yıldızlar boş kalır', () => {
    const html = renderToStaticMarkup(
      <EnergyStars energy={null} onChange={() => {}} label="enerji" />,
    )
    expect(html.match(/☆/g)).toHaveLength(5)
    expect(html).toContain('data-energy="none"')
  })
})

describe('CamelotWheel', () => {
  const html = renderToStaticMarkup(<CamelotWheel active="8A" allowed={DEFAULT_RELATIONS} />)

  it('24 dilim çizer', () => {
    expect(html.match(/class="wheel-slice"/g)).toHaveLength(24)
  })

  it('aktif key beyaz konturlu', () => {
    expect(html).toContain('current key')
    expect(html).toContain('stroke="#ffffff"')
  })

  it('izin verilen ilişkiler kendi ton rengiyle boyanır', () => {
    expect(html).toContain(toneColor('energy'))
    expect(html).toContain(toneColor('calm'))
    expect(html).toContain(toneColor('color'))
    expect(html).toContain('this relation is off')
  })

  it('numaralar dış halkada yazılı', () => {
    expect(html.match(/class="wheel-label"/g)).toHaveLength(12)
  })

  it('aktif key yokken de çizilir', () => {
    const empty = renderToStaticMarkup(<CamelotWheel active={null} allowed={DEFAULT_RELATIONS} />)
    expect(empty).toContain('key yok')
    expect(empty.match(/class="wheel-slice"/g)).toHaveLength(24)
  })
})

describe('TempoCurve', () => {
  it('noktaları key rengiyle çizer', () => {
    const html = renderToStaticMarkup(
      <TempoCurve
        points={[
          { bpm: 120, key: '8A', label: 'Bir' },
          { bpm: 124, key: '9A', label: 'İki' },
          { bpm: 128, key: '10A', label: 'Üç' },
        ]}
      />,
    )
    expect(html.match(/<circle/g)).toHaveLength(3)
    expect(html).toContain('<polyline')
    expect(html).toContain('120 BPM')
  })

  it('iki noktadan azında ne gerektiğini söyler', () => {
    const html = renderToStaticMarkup(<TempoCurve points={[{ bpm: 120, key: '8A' }]} />)
    expect(html).toContain('at least two tracks with a tempo')
  })

  it('düz sette de çizgi üretir', () => {
    const html = renderToStaticMarkup(
      <TempoCurve
        points={[
          { bpm: 124, key: '8A' },
          { bpm: 124, key: '9A' },
        ]}
      />,
    )
    expect(html).toContain('<polyline')
  })

  const three = [
    { bpm: 120, key: '8A' },
    { bpm: 124, key: '9A' },
    { bpm: 128, key: '10A' },
  ]

  function barHeights(html: string): number[] {
    return [...html.matchAll(/class="energy-bar[^"]*"[^>]*height="([\d.]+)"/g)].map((match) =>
      Number(match[1]),
    )
  }

  it('enerji serisi yokken çubuk çizmez', () => {
    const html = renderToStaticMarkup(<TempoCurve points={three} />)
    expect(html).not.toContain('energy-bar')
  })

  it('boş seride çubuk çizmez ama çizgiyi korur', () => {
    const html = renderToStaticMarkup(<TempoCurve points={three} energy={[]} />)
    expect(html).not.toContain('energy-bar')
    expect(html).toContain('<polyline')
  })

  it('enerjisi olmayan girdide sıfır boylu çubuk yerine boşluk bırakır', () => {
    const html = renderToStaticMarkup(
      <TempoCurve
        points={three}
        energy={[{ level: 2, rated: true }, null, { level: 4, rated: true }]}
      />,
    )
    const heights = barHeights(html)
    expect(heights).toHaveLength(2)
    expect(heights.every((value) => value > 0)).toBe(true)
  })

  it('çubukları kendi 1-5 ölçeğinde boylar, tempodan bağımsız', () => {
    const html = renderToStaticMarkup(
      <TempoCurve
        points={three}
        energy={[
          { level: 5, rated: true },
          { level: 1, rated: true },
          { level: 5, rated: true },
        ]}
      />,
    )
    const [high, low, again] = barHeights(html)
    expect(high).toBe(again)
    expect(high).toBeCloseTo(low * 5)
  })

  it('tahmini ve puanlanmış çubukları ayrı sınıfla ayırır', () => {
    const html = renderToStaticMarkup(
      <TempoCurve
        points={three}
        energy={[{ level: 3, rated: true }, { level: 3, rated: false }, null]}
      />,
    )
    expect(html.match(/class="energy-bar rated"/g)).toHaveLength(1)
    expect(html.match(/class="energy-bar estimated"/g)).toHaveLength(1)
  })

  it('çubukları çizginin arkasına çizer', () => {
    const html = renderToStaticMarkup(
      <TempoCurve points={three} energy={[{ level: 3, rated: true }, null, null]} />,
    )
    expect(html.indexOf('energy-bar')).toBeLessThan(html.indexOf('<polyline'))
  })

  it('enerji serisi BPM çizgisini değiştirmez', () => {
    const plain = renderToStaticMarkup(<TempoCurve points={three} />)
    const withEnergy = renderToStaticMarkup(
      <TempoCurve points={three} energy={three.map(() => ({ level: 4, rated: false }))} />,
    )
    const line = (html: string) => html.match(/<polyline[^>]*points="([^"]*)"/)?.[1]
    expect(line(withEnergy)).toBe(line(plain))
  })

  it('bozuk ya da ölçek dışı seviyeyi çizmez', () => {
    const html = renderToStaticMarkup(
      <TempoCurve
        points={three}
        energy={[
          { level: Number.NaN, rated: true },
          { level: 0, rated: false },
          { level: 9, rated: true },
        ]}
      />,
    )
    expect(html).not.toContain('energy-bar')
  })

  it('aynı girdiden aynı çizimi üretir', () => {
    const energy = [{ level: 2, rated: false }, null, { level: 5, rated: true }]
    const first = renderToStaticMarkup(<TempoCurve points={three} energy={energy} />)
    const second = renderToStaticMarkup(<TempoCurve points={three} energy={energy} />)
    expect(first).toBe(second)
  })
})
