import { beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { initialAppState, useStore } from '../store/store'
import { SetlistMenu } from './SetlistMenu'
import { SetlistPanel } from './SetlistPanel'
import { SetSummaryPanel } from './SetSummaryPanel'
import { SuggestPanel } from './SuggestPanel'
import type { Catalog, Track } from '../lib/types'

// zustand serves the initial state during server rendering, so panels are
// mounted on a real client root instead.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function render(node: ReactElement): Promise<string> {
  const view = await mount(node)
  const html = view.html()
  await view.unmount()
  return html
}

interface Mounted {
  container: HTMLElement
  html: () => string
  click: (selector: string) => Promise<void>
  unmount: () => Promise<void>
}

async function mount(node: ReactElement): Promise<Mounted> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(node)
  })
  return {
    container,
    html: () => container.innerHTML,
    click: async (selector) => {
      const element = container.querySelector<HTMLElement>(selector)
      if (!element) throw new Error(`Bulunamadı: ${selector}`)
      await act(async () => {
        element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    },
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

function track(partial: Partial<Track> & { id: string }): Track {
  return {
    title: `Parça ${partial.id}`,
    artist: `Sanatçı ${partial.id}`,
    bpm: 124,
    key: '8A',
    duration: 360,
    source: 'library',
    ...partial,
  }
}

const catalog: Catalog = {
  updatedAt: '2026-01-01T00:00:00.000Z',
  source: 'beatport',
  strategy: 'next-data',
  tracks: [
    track({ id: 'c1', key: '9A', bpm: 124, source: 'catalog', genre: 'Tech House' }),
    track({ id: 'c2', key: '8A', bpm: 125, source: 'catalog', genre: 'Techno' }),
    track({ id: 'c3', key: '2A', bpm: 124, source: 'catalog', genre: 'Techno' }),
  ],
}

beforeEach(() => {
  useStore.setState({
    ...initialAppState(),
    catalog: null,
    sync: { status: 'idle', message: null, savedAt: null },
  })
})

describe('SetlistPanel', () => {
  it('boş sette ne yapılacağını söyler', async () => {
    const html = await render(<SetlistPanel />)
    expect(html).toContain('Empty set')
    expect(html).toContain('Set 1')
  })

  it('parçaları sıra numarası, key ve tempoyla listeler', async () => {
    useStore.getState().addTrack(track({ id: '1', title: 'Gece', key: '8A', bpm: 120 }))
    useStore.getState().addTrack(track({ id: '2', title: 'Sabah', key: '9A', bpm: 122 }))
    const html = await render(<SetlistPanel />)
    expect(html).toContain('Gece')
    expect(html).toContain('Sabah')
    expect(html).toContain('2 tracks')
  })

  it('uyumlu geçişte ilişki etiketi, uyumsuzda uyarı gösterir', async () => {
    useStore.getState().addTrack(track({ id: '1', key: '8A', bpm: 120 }))
    useStore.getState().addTrack(track({ id: '2', key: '9A', bpm: 122 }))
    useStore.getState().addTrack(track({ id: '3', key: '12A', bpm: 122 }))
    const html = await render(<SetlistPanel />)
    expect(html).toContain('+1 · energy ↑')
    expect(html).toContain('no defined transition')
    expect(html).toContain('put a compatible track between them')
  })

  it('tolerans dışındaki tempo farkını uyarır', async () => {
    useStore.getState().addTrack(track({ id: '1', key: '8A', bpm: 120 }))
    useStore.getState().addTrack(track({ id: '2', key: '8A', bpm: 140 }))
    const html = await render(<SetlistPanel />)
    expect(html).toContain('outside your tolerance (6%)')
  })

  it('kalp parçayı favoriye ekler ama imleci kaydırmaz', async () => {
    useStore.getState().addTrack(track({ id: '1', title: 'Gece' }))
    useStore.getState().addTrack(track({ id: '2', title: 'Sabah' }))
    const view = await mount(<SetlistPanel />)
    const hearts = view.container.querySelectorAll<HTMLElement>('.fav-btn')
    expect(hearts).toHaveLength(2)

    // The cursor sits on the last added track; the heart must not drag it back.
    expect(useStore.getState().cursor).toBe(1)
    await act(async () => {
      hearts[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useStore.getState().favorites.map((item) => item.id)).toEqual(['1'])
    expect(useStore.getState().cursor).toBe(1)
    expect(view.container.querySelectorAll('.fav-btn')[0].getAttribute('aria-pressed')).toBe('true')
    await view.unmount()
  })

  it('parça ekleme düğmelerini gösterir', async () => {
    const html = await render(<SetlistPanel onOpenSearch={() => {}} onOpenAutoBuild={() => {}} />)
    expect(html).toContain('find a track')
    expect(html).toContain('build it for me')
  })
})

describe('SetlistMenu', () => {
  it('kapalıyken yalnızca aktif setin adını gösterir', async () => {
    useStore.getState().newSetlist('İkinci')
    const html = await render(<SetlistMenu />)
    expect(html).toContain('İkinci')
    expect(html).not.toContain('menu-panel')
  })

  it('açıldığında bütün setleri ve yeni set düğmesini listeler', async () => {
    useStore.getState().newSetlist('İkinci')
    const view = await mount(<SetlistMenu />)
    await view.click('.menu-button')
    expect(view.html()).toContain('Set 1 · 0')
    expect(view.html()).toContain('İkinci · 0')
    expect(view.html()).toContain('+ new set')
    await view.unmount()
  })

  it('menüden set seçince aktif set değişir', async () => {
    useStore.getState().newSetlist('İkinci')
    const first = useStore.getState().setlists[0].id
    const view = await mount(<SetlistMenu />)
    await view.click('.menu-button')
    await view.click('.menu-name')
    expect(useStore.getState().activeId).toBe(first)
    // Seçimden sonra menü kapanır.
    expect(view.html()).not.toContain('menu-panel')
    await view.unmount()
  })
})

describe('SetSummaryPanel', () => {
  it('iki parçadan sonra tempo eğrisi çizilir', async () => {
    useStore.getState().addTrack(track({ id: '1', bpm: 120 }))
    useStore.getState().addTrack(track({ id: '2', bpm: 124, key: '9A' }))
    expect(await render(<SetSummaryPanel />)).toContain('<polyline')
  })

  it('dışa aktarım düğmelerini ve set notunu gösterir', async () => {
    const html = await render(<SetSummaryPanel />)
    expect(html).toContain('.m3u8')
    expect(html).toContain('copy')
    expect(html).toContain('set note')
  })

  it('süre, tempo aralığı ve zorlayan geçiş sayısını yazar', async () => {
    useStore.getState().addTrack(track({ id: '1', bpm: 120, key: '8A', duration: 300 }))
    useStore.getState().addTrack(track({ id: '2', bpm: 124, key: '9A', duration: 300 }))
    useStore.getState().addTrack(track({ id: '3', bpm: 124, key: '12A', duration: 300 }))
    const html = await render(<SetSummaryPanel />)
    expect(html).toContain('15 min')
    expect(html).toContain('120–124')
    expect(html).toContain('rough transitions')
  })
})

describe('SuggestPanel', () => {
  it('referans yokken ne yapılacağını söyler', async () => {
    expect(await render(<SuggestPanel />)).toContain('Add a track to the setlist first')
  })

  it('referans parçayı, hedef aralığı ve çemberi gösterir', async () => {
    useStore.getState().setCatalog(catalog)
    useStore.getState().addTrack(track({ id: '1', title: 'Referans', bpm: 124, key: '8A' }))
    const html = await render(<SuggestPanel />)
    expect(html).toContain('Referans')
    expect(html).toContain('target 116.6 – 131.4 BPM')
    expect(html).toContain('wheel-slice')
  })

  it('öneriyi sete eklemeden favoriye alır', async () => {
    useStore.getState().setCatalog(catalog)
    useStore.getState().addTrack(track({ id: '1', bpm: 124, key: '8A' }))
    const view = await mount(<SuggestPanel />)
    await view.click('.fav-btn')
    const state = useStore.getState()
    expect(state.favorites).toHaveLength(1)
    expect(state.favorites[0].source).toBe('catalog')
    expect(state.setlists[0].entries).toHaveLength(1)
    await view.unmount()
  })

  it('adayları ilişkiye göre gruplar ve uyumsuzu listelemez', async () => {
    useStore.getState().setCatalog(catalog)
    useStore.getState().addTrack(track({ id: '1', bpm: 124, key: '8A' }))
    const html = await render(<SuggestPanel />)
    expect(html).toContain('Same key · 1')
    expect(html).toContain('+1 · energy ↑ · 1')
    expect(html).not.toContain('Parça c3')
  })

  it('tolerans basamaklarını gösterir ve seçili olanı işaretler', async () => {
    useStore.getState().setCatalog(catalog)
    useStore.getState().addTrack(track({ id: '1', bpm: 124, key: '8A' }))
    useStore.getState().setTolerance(10)

    const view = await mount(<SuggestPanel />)
    const segments = [...view.container.querySelectorAll('.segment')]
    expect(segments.map((item) => item.textContent)).toEqual(['±3%', '±6%', '±8%', '±10%', '±12%'])
    expect(segments.filter((item) => item.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
    expect(view.html()).toContain('tempo tolerance · 10%')

    await view.click('.segment')
    expect(useStore.getState().tolerance).toBe(3)
    await view.unmount()
  })

  it('aday çıkmayınca ne yapılacağını söyler', async () => {
    useStore.getState().setCatalog({ ...catalog, tracks: [] })
    useStore.getState().addTrack(track({ id: '1', bpm: 124, key: '8A' }))
    expect(await render(<SuggestPanel />)).toContain('Raise the tolerance')
  })

  it('havuz sekmesi kütüphaneye geçebiliyor', async () => {
    useStore.setState({ library: [track({ id: 'l1', key: '9A' })] })
    useStore.getState().setPoolSource('library')
    useStore.getState().addTrack(track({ id: '1', bpm: 124, key: '8A' }))
    const html = await render(<SuggestPanel />)
    expect(html).toContain('My library')
    expect(html).toContain('Parça l1')
  })
})
