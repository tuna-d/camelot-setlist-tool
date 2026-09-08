import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_RELATIONS } from '../lib/camelot'
import { toneColor } from '../lib/ui'
import { Bpm, KeyChip, TrackLinks, youtubeSearchUrl } from './common'
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
    // Kesme işareti React tarafından kaçırılıyor: attribute erken kapanmıyor.
    expect(html).toContain('beatport.com/search?q=Kaya%20Becca&#x27;s%20Booty')
    expect(html).toContain('youtube.com/results?search_query=')
  })

  it('arama adresi sanatçı ve başlığı birleştirir', () => {
    expect(youtubeSearchUrl(track)).toBe(
      "https://www.youtube.com/results?search_query=Kaya%20Becca's%20Booty",
    )
  })
})

describe('CamelotWheel', () => {
  const html = renderToStaticMarkup(<CamelotWheel active="8A" allowed={DEFAULT_RELATIONS} />)

  it('24 dilim çizer', () => {
    expect(html.match(/class="wheel-slice"/g)).toHaveLength(24)
  })

  it('aktif key beyaz konturlu', () => {
    expect(html).toContain('şu anki key')
    expect(html).toContain('stroke="#ffffff"')
  })

  it('izin verilen ilişkiler kendi ton rengiyle boyanır', () => {
    expect(html).toContain(toneColor('energy')) // +1
    expect(html).toContain(toneColor('calm')) // −1
    expect(html).toContain(toneColor('color')) // relatif
    // Kapalı ilişki sönük kalır.
    expect(html).toContain('bu ilişki kapalı')
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
    expect(html).toContain('en az iki tempolu parça')
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
