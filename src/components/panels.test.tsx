import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('SetlistPanel enerji', () => {
  function starsOf(view: Mounted, index: number): HTMLElement {
    return view.container.querySelectorAll<HTMLElement>('.entry-extras .stars')[index]
  }

  it('puanlanmamış girişte tahmini, puanlananda puanı gösterir', async () => {
    useStore.setState({ catalog })
    useStore.getState().addTrack(track({ id: '1', bpm: 126, key: '8A' }))
    useStore.getState().addTrack(track({ id: '2', bpm: 120, key: '8A' }))
    useStore.getState().setEntryEnergy(1, 3)
    const view = await mount(<SetlistPanel />)

    expect(starsOf(view, 0).dataset.energy).toBe('estimated')
    expect(starsOf(view, 0).querySelectorAll('.star-estimated')).toHaveLength(5)
    expect(starsOf(view, 1).dataset.energy).toBe('rated')
    expect(starsOf(view, 1).querySelectorAll('[aria-pressed="true"]')).toHaveLength(3)
    await view.unmount()
  })

  it('yıldıza basmak tahmini puana çevirir, aynı yıldız tahmine geri döndürür', async () => {
    useStore.setState({ catalog })
    useStore.getState().addTrack(track({ id: '1', bpm: 126, key: '8A' }))
    const view = await mount(<SetlistPanel />)

    const star = () => starsOf(view, 0).querySelectorAll<HTMLElement>('.star')[1]
    await act(async () => {
      star().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useStore.getState().setlists[0].entries[0].energy).toBe(2)
    expect(starsOf(view, 0).dataset.energy).toBe('rated')

    await act(async () => {
      star().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useStore.getState().setlists[0].entries[0].energy).toBeUndefined()
    expect(starsOf(view, 0).dataset.energy).toBe('estimated')
    await view.unmount()
  })

  it('tempo bilinmeyen parçada tahmin yok, yıldızlar boş', async () => {
    useStore.setState({ catalog })
    useStore.getState().addTrack(track({ id: '1', bpm: null }))
    const view = await mount(<SetlistPanel />)
    expect(starsOf(view, 0).dataset.energy).toBe('none')
    expect(starsOf(view, 0).textContent).toBe('☆☆☆☆☆')
    await view.unmount()
  })
})

describe('SetlistPanel bulunamayan giriş', () => {
  // A catalog refresh can drop a track that a set still points at.
  function withMissingMiddle() {
    useStore.getState().addTrack(track({ id: '1', title: 'Gece', bpm: 120 }))
    useStore.getState().addTrack(track({ id: '2', title: 'Sabah', bpm: 122 }))
    const active = useStore.getState().setlists[0]
    useStore.setState({
      setlists: [
        {
          ...active,
          entries: [
            { trackId: '1', note: 'bir' },
            { trackId: 'kayıp', note: 'kayıp' },
            { trackId: '2', note: 'iki', energy: 4 },
          ],
        },
      ],
      cursor: 2,
    })
  }

  function rows(view: Mounted): HTMLElement[] {
    return [...view.container.querySelectorAll<HTMLElement>('ol.entries > li')]
  }

  it('bulunamayan girişi ne olduğunu ve ne yapılacağını söyleyen satırla gösterir', async () => {
    withMissingMiddle()
    const view = await mount(<SetlistPanel />)
    const items = rows(view)
    expect(items).toHaveLength(3)
    expect(items[1].querySelector('.entry-missing')?.textContent).toContain('no longer available')
    expect(items[1].textContent).toContain('Remove it')
    expect(view.html()).toContain('1 missing')
    await view.unmount()
  })

  it('bulunamayan girişten sonraki satır kendi notunu, puanını ve sıra numarasını gösterir', async () => {
    withMissingMiddle()
    const view = await mount(<SetlistPanel />)
    const last = rows(view)[2]
    expect(last.textContent).toContain('Sabah')
    expect(last.querySelector('.entry-index')?.textContent).toBe('3')
    expect(last.querySelector<HTMLInputElement>('.entry-note')?.value).toBe('iki')
    expect(last.querySelector<HTMLElement>('.stars')?.dataset.energy).toBe('rated')
    expect(last.querySelectorAll('.star[aria-pressed="true"]')).toHaveLength(4)
    expect(last.querySelector('.entry')?.getAttribute('aria-current')).toBe('true')
    await view.unmount()
  })

  it('sonraki satırdaki düzenleme doğru girişe yazılır', async () => {
    withMissingMiddle()
    const view = await mount(<SetlistPanel />)
    await act(async () => {
      rows(view)[2].querySelectorAll<HTMLElement>('.star')[1].dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    const entries = useStore.getState().setlists[0].entries
    expect(entries.map((entry) => entry.energy)).toEqual([undefined, undefined, 2])
    await view.unmount()
  })

  it('bulunamayan giriş silinince sonrakiler yerinde kalır', async () => {
    withMissingMiddle()
    const view = await mount(<SetlistPanel />)
    await act(async () => {
      rows(view)[1].querySelector<HTMLElement>('.btn-danger')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
    })
    expect(useStore.getState().setlists[0].entries.map((entry) => entry.trackId)).toEqual(['1', '2'])
    expect(rows(view)).toHaveLength(2)
    expect(rows(view)[1].querySelector<HTMLInputElement>('.entry-note')?.value).toBe('iki')
    await view.unmount()
  })

  it('YouTube kuyruğu sıradaki parçanın kendi satırını işaretler', async () => {
    withMissingMiddle()
    const view = await mount(<SetlistPanel />)
    await view.click('.queue-open')
    const queued = view.container.querySelector('[data-queue="next"]')
    expect(queued?.textContent).toContain('Sabah')
    expect(queued?.querySelector('.entry-index')?.textContent).toBe('3')
    await view.unmount()
  })

  it('bulunamayan girişin iki yanına geçiş köprüsü çizmez', async () => {
    withMissingMiddle()
    const view = await mount(<SetlistPanel />)
    expect(view.container.querySelectorAll('.bridge')).toHaveLength(0)
    await view.unmount()
  })
})

describe('SetlistPanel YouTube kuyruğu', () => {
  function addThree() {
    useStore.getState().addTrack(track({ id: '1', title: 'Gece', artist: 'Kaya' }))
    useStore.getState().addTrack(track({ id: '2', title: 'Sabah', artist: 'Deniz' }))
    useStore.getState().addTrack(track({ id: '3', title: 'Öğle', artist: 'Bulut' }))
  }

  function queuedTitle(container: HTMLElement): string | null {
    return container.querySelector('[data-queue="next"] .entry-title strong')?.textContent ?? null
  }

  function queueCount(container: HTMLElement): string | null {
    return container.querySelector('.queue-count')?.textContent ?? null
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('boş sette kuyruk düğmesi yok', async () => {
    expect(await render(<SetlistPanel />)).not.toContain('queue-open')
  })

  function queueLink(container: HTMLElement): HTMLAnchorElement | null {
    return container.querySelector<HTMLAnchorElement>('a.queue-open')
  }

  it('sıradaki parçanın aramasına giden tek bir bağlantı sunar ve basınca ilerler', async () => {
    addThree()
    // happy-dom follows target=_blank links through window.open; keep it from doing so.
    vi.spyOn(window, 'open').mockReturnValue(null)
    const view = await mount(<SetlistPanel />)
    expect(queueCount(view.container)).toBe('0 / 3')
    expect(queuedTitle(view.container)).toBe('Gece')

    // A real link, so ctrl/cmd+click and middle-click open the tab in the background.
    const link = queueLink(view.container)
    expect(link?.getAttribute('href')).toBe(
      'https://www.youtube.com/results?search_query=Kaya%20Gece',
    )
    expect(link?.getAttribute('target')).toBe('_blank')

    await view.click('.queue-open')
    expect(queueCount(view.container)).toBe('1 / 3')
    expect(queuedTitle(view.container)).toBe('Sabah')
    expect(queueLink(view.container)?.getAttribute('href')).toBe(
      'https://www.youtube.com/results?search_query=Deniz%20Sabah',
    )
    await view.unmount()
  })

  it('orta tuşla açınca da ilerler, sağ tık ilerletmez', async () => {
    addThree()
    const view = await mount(<SetlistPanel />)
    const aux = async (button: number) => {
      await act(async () => {
        const event = new MouseEvent('auxclick', { bubbles: true, button })
        queueLink(view.container)!.dispatchEvent(event)
      })
    }
    await aux(2)
    expect(queueCount(view.container)).toBe('0 / 3')
    await aux(1)
    expect(queueCount(view.container)).toBe('1 / 3')
    expect(queuedTitle(view.container)).toBe('Sabah')
    await view.unmount()
  })

  it('işaret referans parçanın vurgusundan ayrı', async () => {
    addThree()
    const view = await mount(<SetlistPanel />)
    const marked = view.container.querySelector('[data-queue="next"]')
    // The reference sits on the last added track, the queue on the first.
    expect(marked?.getAttribute('aria-current')).toBe('false')
    expect(marked?.classList.contains('entry-queued')).toBe(true)
    expect(view.container.querySelector('[aria-current="true"]')?.hasAttribute('data-queue')).toBe(
      false,
    )
    await view.unmount()
  })

  it('bütün parçalar açılınca geçişin bittiğini söyler, sıfırlama başa döner', async () => {
    addThree()
    vi.spyOn(window, 'open').mockReturnValue(null)
    const view = await mount(<SetlistPanel />)
    for (let i = 0; i < 3; i++) await view.click('.queue-open')

    expect(view.html()).toContain('Every track has been opened')
    expect(queueCount(view.container)).toBe('3 / 3')
    expect(queueLink(view.container)).toBeNull()
    const spent = view.container.querySelector<HTMLButtonElement>('button.queue-open')
    expect(spent?.disabled).toBe(true)
    expect(queuedTitle(view.container)).toBeNull()

    await view.click('.queue-reset')
    expect(queueCount(view.container)).toBe('0 / 3')
    expect(queuedTitle(view.container)).toBe('Gece')
    await view.unmount()
  })

  it('açılan parça silinince ardından gelene geçer, sıra değişince aynı parçada kalır', async () => {
    addThree()
    vi.spyOn(window, 'open').mockReturnValue(null)
    const view = await mount(<SetlistPanel />)
    await view.click('.queue-open')
    expect(queuedTitle(view.container)).toBe('Sabah')

    // Gece was opened; removing it leaves the queue on the track that followed it.
    await act(async () => useStore.getState().removeEntry(0))
    expect(queuedTitle(view.container)).toBe('Sabah')
    expect(queueCount(view.container)).toBe('0 / 2')

    await act(async () => useStore.getState().moveEntry(0, 1))
    expect(queuedTitle(view.container)).toBe('Sabah')
    await view.click('.queue-open')
    expect(queuedTitle(view.container)).toBe('Öğle')
    await view.unmount()
  })

  it('başka sete geçince kuyruk sıfırlanır ve kayda hiçbir şey yazılmaz', async () => {
    addThree()
    vi.spyOn(window, 'open').mockReturnValue(null)
    const first = useStore.getState().activeId!
    const view = await mount(<SetlistPanel />)
    const record = () => JSON.stringify({ ...useStore.getState().exportState(), savedAt: 0 })
    const before = record()
    await view.click('.queue-open')
    expect(record()).toBe(before)

    await act(async () => useStore.getState().newSetlist('İkinci'))
    await act(async () => useStore.getState().selectSetlist(first))
    expect(queueCount(view.container)).toBe('0 / 3')
    await view.unmount()
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

  it('bulunamayan girdi varken enerji çubuğu kendi parçasının noktasına düşer', async () => {
    useStore.getState().addTrack(track({ id: '1', bpm: 120 }))
    useStore.getState().addTrack(track({ id: '2', bpm: 124 }))
    const active = useStore.getState().setlists[0]
    useStore.setState({
      setlists: [
        {
          ...active,
          entries: [{ trackId: '1' }, { trackId: 'kayıp', energy: 1 }, { trackId: '2', energy: 4 }],
        },
      ],
    })
    const view = await mount(<SetSummaryPanel />)
    const bars = view.container.querySelectorAll('.energy-bar')
    const circles = view.container.querySelectorAll('.tempo-curve circle')
    // With no pool to measure against, the unrated track has no estimate: a gap.
    expect(bars).toHaveLength(1)
    expect(bars[0].getAttribute('class')).toBe('energy-bar rated')
    expect(Number(bars[0].getAttribute('x'))).toBeGreaterThan(
      Number(circles[0].getAttribute('cx')),
    )
    expect(circles[1].textContent).toContain('energy 4')
    await view.unmount()
  })

  it('yalnızca bulunamayan parçalardan oluşan set de temizlenebilir', async () => {
    const active = useStore.getState().setlists[0]
    useStore.setState({ setlists: [{ ...active, entries: [{ trackId: 'kayıp' }] }] })
    vi.stubGlobal('confirm', () => true)
    const view = await mount(<SetSummaryPanel />)
    const clear = [...view.container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'clear',
    )
    expect(clear?.disabled).toBe(false)
    await act(async () => {
      clear?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useStore.getState().setlists[0].entries).toEqual([])
    vi.unstubAllGlobals()
    await view.unmount()
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

  it('başka sette geçen öneriye rozet koyar, sırasını ve görünüşünü değiştirmez', async () => {
    useStore.getState().setCatalog(catalog)
    useStore.getState().addTrack(track({ id: '1', bpm: 124, key: '8A' }))
    const before = await render(<SuggestPanel />)

    useStore.getState().renameSetlist(useStore.getState().setlists[0].id, 'Cuma')
    useStore.getState().addTrack(catalog.tracks[1])
    useStore.getState().removeEntry(0)
    useStore.getState().newSetlist('Bu gece')
    useStore.getState().addTrack(track({ id: '1', bpm: 124, key: '8A' }))
    const view = await mount(<SuggestPanel />)

    const badges = view.container.querySelectorAll('.seen-badge')
    expect(badges).toHaveLength(1)
    expect(badges[0].getAttribute('title')).toBe('Already in another set: Cuma')
    expect(badges[0].closest('.entry')?.textContent).toContain('Parça c2')
    const withoutBadge = view.html().replace(/<span class="seen-badge".*?<\/span>/g, '')
    expect(withoutBadge).toBe(before)
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
