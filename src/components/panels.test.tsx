import { beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { initialAppState, useStore } from '../store/store'
import { SetlistPanel } from './SetlistPanel'
import { SuggestPanel } from './SuggestPanel'
import type { Catalog, Track } from '../lib/types'

// zustand serves the initial state during server rendering, so panels are
// mounted on a real client root instead.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

async function render(node: ReactElement): Promise<string> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(node)
  })
  const html = container.innerHTML
  await act(async () => {
    root.unmount()
  })
  container.remove()
  return html
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
    expect(html).toContain('Set boş')
    expect(html).toContain('Set 1 · 0')
  })

  it('parçaları sıra numarası, key ve tempoyla listeler', async () => {
    useStore.getState().addTrack(track({ id: '1', title: 'Gece', key: '8A', bpm: 120 }))
    useStore.getState().addTrack(track({ id: '2', title: 'Sabah', key: '9A', bpm: 122 }))
    const html = await render(<SetlistPanel />)
    expect(html).toContain('Gece')
    expect(html).toContain('Sabah')
    expect(html).toContain('2 parça')
  })

  it('uyumlu geçişte ilişki etiketi, uyumsuzda uyarı gösterir', async () => {
    useStore.getState().addTrack(track({ id: '1', key: '8A', bpm: 120 }))
    useStore.getState().addTrack(track({ id: '2', key: '9A', bpm: 122 }))
    useStore.getState().addTrack(track({ id: '3', key: '12A', bpm: 122 }))
    const html = await render(<SetlistPanel />)
    expect(html).toContain('+1 · enerji ↑')
    expect(html).toContain('Uyumsuz key')
    expect(html).toContain('araya uyumlu bir parça koy')
  })

  it('tolerans dışındaki tempo farkını uyarır', async () => {
    useStore.getState().addTrack(track({ id: '1', key: '8A', bpm: 120 }))
    useStore.getState().addTrack(track({ id: '2', key: '8A', bpm: 140 }))
    const html = await render(<SetlistPanel />)
    expect(html).toContain('toleransın (%6) dışında')
  })

  it('setlist sekmelerini ve dışa aktarım düğmelerini gösterir', async () => {
    useStore.getState().newSetlist('İkinci')
    const html = await render(<SetlistPanel />)
    expect(html).toContain('Set 1 · 0')
    expect(html).toContain('İkinci · 0')
    expect(html).toContain('.m3u8')
    expect(html).toContain('kopyala')
  })

  it('iki parçadan sonra tempo eğrisi çizilir', async () => {
    useStore.getState().addTrack(track({ id: '1', bpm: 120 }))
    useStore.getState().addTrack(track({ id: '2', bpm: 124, key: '9A' }))
    expect(await render(<SetlistPanel />)).toContain('<polyline')
  })
})

describe('SuggestPanel', () => {
  it('referans yokken ne yapılacağını söyler', async () => {
    expect(await render(<SuggestPanel />)).toContain('Önce setliste bir parça ekle')
  })

  it('referans parçayı, hedef aralığı ve çemberi gösterir', async () => {
    useStore.getState().setCatalog(catalog)
    useStore.getState().addTrack(track({ id: '1', title: 'Referans', bpm: 124, key: '8A' }))
    const html = await render(<SuggestPanel />)
    expect(html).toContain('Referans')
    expect(html).toContain('hedef 116.6 – 131.4 BPM')
    expect(html).toContain('wheel-slice')
  })

  it('adayları ilişkiye göre gruplar ve uyumsuzu listelemez', async () => {
    useStore.getState().setCatalog(catalog)
    useStore.getState().addTrack(track({ id: '1', bpm: 124, key: '8A' }))
    const html = await render(<SuggestPanel />)
    expect(html).toContain('Aynı key · 1')
    expect(html).toContain('+1 · enerji ↑ · 1')
    expect(html).not.toContain('Parça c3')
  })

  it('aday çıkmayınca ne yapılacağını söyler', async () => {
    useStore.getState().setCatalog({ ...catalog, tracks: [] })
    useStore.getState().addTrack(track({ id: '1', bpm: 124, key: '8A' }))
    expect(await render(<SuggestPanel />)).toContain('Toleransı yükselt')
  })

  it('havuz sekmesi kütüphaneye geçebiliyor', async () => {
    useStore.setState({ library: [track({ id: 'l1', key: '9A' })] })
    useStore.getState().setPoolSource('library')
    useStore.getState().addTrack(track({ id: '1', bpm: 124, key: '8A' }))
    const html = await render(<SuggestPanel />)
    expect(html).toContain('Kütüphanem')
    expect(html).toContain('Parça l1')
  })
})
