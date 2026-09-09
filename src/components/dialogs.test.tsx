import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { initialAppState, selectEntries, useStore } from '../store/store'
import { AutoBuildDialog } from './AutoBuildDialog'
import { ImportDialog } from './ImportDialog'
import { TrackSearchDialog } from './TrackSearchDialog'
import type { Catalog, Track } from '../lib/types'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Mounted {
  container: HTMLElement
  root: Root
  html: () => string
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
    root,
    html: () => container.innerHTML,
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    },
  }
}

async function type(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
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
    track({ id: 'c1', title: 'Gece Yürüyüşü', artist: 'Ayla', key: '9A', source: 'catalog' }),
    track({ id: 'c2', title: 'Kum Saati', artist: 'Deniz', key: '8A', bpm: 125, source: 'catalog' }),
    track({ id: 'c3', title: 'Sabah', artist: 'Mor', key: '7A', bpm: 123, source: 'catalog' }),
  ],
}

beforeEach(() => {
  useStore.setState({
    ...initialAppState(),
    catalog: null,
    sync: { status: 'idle', message: null, savedAt: null },
  })
})

describe('ImportDialog', () => {
  it('sürükle-bırak alanını ve yönergeyi gösterir', async () => {
    const view = await mount(<ImportDialog open onClose={() => {}} />)
    expect(view.html()).toContain('Drag the XML file here')
    expect(view.html()).toContain('Export Collection')
    await view.unmount()
  })

  it('bozuk dosyada ne yapılacağını söyler', async () => {
    const view = await mount(<ImportDialog open onClose={() => {}} />)
    const input = view.container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()

    const file = new File(['<PLAYLIST/>'], 'koleksiyon.xml', { type: 'text/xml' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await act(async () => {
      input!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(view.html()).toContain('DJ_PLAYLISTS')
    await view.unmount()
  })
})

describe('TrackSearchDialog', () => {
  it('yazmadan önce üç kaynağı anlatır', async () => {
    const view = await mount(<TrackSearchDialog open onClose={() => {}} />)
    expect(view.html()).toContain('library and the discovery catalog are filtered')
    await view.unmount()
  })

  it('kütüphane ve katalogda anında arar, kaynak rozeti gösterir', async () => {
    useStore.setState({ library: [track({ id: 'l1', title: 'Gece Vakti', artist: 'Ayla' })] })
    useStore.getState().setCatalog(catalog)

    const view = await mount(<TrackSearchDialog open onClose={() => {}} />)
    const input = view.container.querySelector('input.input') as HTMLInputElement
    await type(input, 'gece')

    expect(view.html()).toContain('Gece Vakti')
    expect(view.html()).toContain('Gece Yürüyüşü')
    expect(view.html()).toContain('library')
    expect(view.html()).toContain('discovery')
    await view.unmount()
  })

  it('Türkçe karakter yazmadan bulur', async () => {
    useStore.getState().setCatalog(catalog)
    const view = await mount(<TrackSearchDialog open onClose={() => {}} />)
    await type(view.container.querySelector('input.input') as HTMLInputElement, 'yuruyus')
    expect(view.html()).toContain('Gece Yürüyüşü')
    await view.unmount()
  })

  it('bulunamayınca internet ve elle giriş önerir', async () => {
    const view = await mount(<TrackSearchDialog open onClose={() => {}} />)
    await type(view.container.querySelector('input.input') as HTMLInputElement, 'olmayanbirsey')
    expect(view.html()).toContain('search the web')
    expect(view.html()).toContain('enter by hand')
    await view.unmount()
  })

  it('internet aramasının sonuçlarını listeler', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [{ title: 'Uzak Parça', artist: 'X', bpm: 126, key: 'G Minor' }] }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const view = await mount(<TrackSearchDialog open onClose={() => {}} />)
    await type(view.container.querySelector('input.input') as HTMLInputElement, 'uzak')
    const buttons = [...view.container.querySelectorAll('button')]
    await click(buttons.find((button) => button.textContent === 'search the web')!)

    expect(fetchMock.mock.calls[0][0]).toBe('/api/track-search?q=uzak')
    expect(view.html()).toContain('Uzak Parça')
    expect(view.html()).toContain('web')
    expect(view.html()).toContain('6A')
    vi.unstubAllGlobals()
    await view.unmount()
  })

  it('anahtar yoksa sunucunun açıklamasını gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ results: [], configured: false, message: 'GETSONGBPM_API_KEY tanımlı değil.' }),
          { status: 200 },
        ),
      ),
    )
    const view = await mount(<TrackSearchDialog open onClose={() => {}} />)
    await type(view.container.querySelector('input.input') as HTMLInputElement, 'uzak')
    const buttons = [...view.container.querySelectorAll('button')]
    await click(buttons.find((button) => button.textContent === 'search the web')!)
    expect(view.html()).toContain('GETSONGBPM_API_KEY tanımlı değil.')
    vi.unstubAllGlobals()
    await view.unmount()
  })

  it('elle girilen parça sete eklenir', async () => {
    const view = await mount(<TrackSearchDialog open onClose={() => {}} />)
    await type(view.container.querySelector('input.input') as HTMLInputElement, 'elle')
    await click([...view.container.querySelectorAll('button')].find((b) => b.textContent === 'enter by hand')!)

    const inputs = [...view.container.querySelectorAll('input.input')] as HTMLInputElement[]
    await type(inputs[1], 'Elle Girilen')
    await type(inputs[2], 'Ben')
    await type(inputs[3], '124')
    await type(inputs[4], 'Am')
    await click([...view.container.querySelectorAll('button')].find((b) => b.textContent === 'add to set')!)

    const entries = selectEntries(useStore.getState())
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ title: 'Elle Girilen', bpm: 124, key: '8A', source: 'manual' })
    await view.unmount()
  })

  it('okunamayan key’i uyarır', async () => {
    const view = await mount(<TrackSearchDialog open onClose={() => {}} />)
    await type(view.container.querySelector('input.input') as HTMLInputElement, 'elle')
    await click([...view.container.querySelectorAll('button')].find((b) => b.textContent === 'enter by hand')!)
    const inputs = [...view.container.querySelectorAll('input.input')] as HTMLInputElement[]
    await type(inputs[4], 'zzz')
    expect(view.html()).toContain('key could not be read')
    await view.unmount()
  })
})

describe('AutoBuildDialog', () => {
  it('başlangıç parçası yoksa ne yapılacağını söyler', async () => {
    const view = await mount(<AutoBuildDialog open onClose={() => {}} />)
    expect(view.html()).toContain('Add a starting track to the setlist first')
    await view.unmount()
  })

  it('önizlemeyi ilişki etiketi ve tempo farkıyla gösterir', async () => {
    useStore.getState().setCatalog(catalog)
    useStore.getState().addTrack(track({ id: 'seed', title: 'Başlangıç', key: '8A', bpm: 124 }))

    const view = await mount(<AutoBuildDialog open onClose={() => {}} />)
    expect(view.html()).toContain('preview')
    expect(view.container.querySelectorAll('.entry').length).toBeGreaterThan(1)
    expect(view.html()).toMatch(/Same key|energy ↑|softer/)
    await view.unmount()
  })

  it('havuz yetmediğinde ne yapılacağını söyler', async () => {
    useStore.getState().setCatalog({ ...catalog, tracks: [] })
    useStore.getState().addTrack(track({ id: 'seed', key: '8A', bpm: 124 }))
    const view = await mount(<AutoBuildDialog open onClose={() => {}} />)
    expect(view.html()).toContain('Raise the tolerance')
    await view.unmount()
  })

  it('önizlemeyi sete uygular', async () => {
    useStore.getState().setCatalog(catalog)
    useStore.getState().addTrack(track({ id: 'seed', key: '8A', bpm: 124 }))

    const view = await mount(<AutoBuildDialog open onClose={() => {}} />)
    const apply = [...view.container.querySelectorAll('button')].find(
      (button) => button.textContent === 'add to the set',
    )
    expect(apply).toBeDefined()
    await click(apply!)

    expect(selectEntries(useStore.getState()).length).toBeGreaterThan(1)
    await view.unmount()
  })
})
