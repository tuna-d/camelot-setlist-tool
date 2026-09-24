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
    const html = renderToStaticMarkup(<EnergyStars value={3} onChange={() => {}} label="enerji" />)
    expect(html.match(/★/g)).toHaveLength(3)
    expect(html.match(/☆/g)).toHaveLength(2)
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(3)
  })

  it('puan yokken hepsi boş', () => {
    const html = renderToStaticMarkup(
      <EnergyStars value={undefined} onChange={() => {}} label="enerji" />,
    )
    expect(html.match(/☆/g)).toHaveLength(5)
    expect(html).not.toContain('aria-pressed="true"')
  })
})

describe('EnergyStars tahmini', () => {
  it('puan yokken tahmini soluk yıldızlarla gösterir, hiçbirini basılı saymaz', () => {
    const html = renderToStaticMarkup(
      <EnergyStars value={undefined} estimate={4} onChange={() => {}} label="enerji" />,
    )
    expect(html.match(/star star-estimated/g)).toHaveLength(4)
    expect(html.match(/★/g)).toHaveLength(4)
    expect(html).not.toContain('aria-pressed="true"')
    expect(html).toContain('data-energy="estimated"')
    expect(html).toContain('Estimated energy 4/5')
  })

  it('verilen puan tahminin önüne geçer', () => {
    const html = renderToStaticMarkup(
      <EnergyStars value={2} estimate={4} onChange={() => {}} label="enerji" />,
    )
    expect(html).not.toContain('star-estimated')
    expect(html.match(/★/g)).toHaveLength(2)
    expect(html).toContain('data-energy="rated"')
  })

  it('tahmin de puan da yoksa yıldızlar boş kalır', () => {
    const html = renderToStaticMarkup(
      <EnergyStars value={undefined} estimate={null} onChange={() => {}} label="enerji" />,
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
})
