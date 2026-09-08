import { toCamelot } from './camelot'
import type { Playlist, Track } from './types'

export class RekordboxParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RekordboxParseError'
  }
}

export type XmlParser = (text: string) => Document

export interface ImportStats {
  total: number
  skipped: number
  missingBpm: number
  missingKey: number
  missingLocation: number
  ghostReferences: number
}

export interface RekordboxLibrary {
  tracks: Track[]
  playlists: Playlist[]
  version: string | null
  stats: ImportStats
}

const ELEMENT_NODE = 1

function defaultParseXml(text: string): Document {
  if (typeof DOMParser === 'undefined') {
    throw new RekordboxParseError(
      'Bu ortamda XML okuyucu yok. Dosyayı tarayıcıda içe aktar ya da parseRekordboxXml çağrısına kendi okuyucunu ver.',
    )
  }
  return new DOMParser().parseFromString(text, 'application/xml')
}

function childElements(node: Node, name?: string): Element[] {
  const out: Element[] = []
  const children = node.childNodes
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i]
    if (child.nodeType !== ELEMENT_NODE) continue
    const element = child as Element
    if (!name || element.nodeName === name) out.push(element)
  }
  return out
}

function firstChild(node: Node, name: string): Element | null {
  return childElements(node, name)[0] ?? null
}

function hasParserError(doc: Document): boolean {
  const root = doc.documentElement
  if (!root) return true
  if (root.nodeName.toLowerCase() === 'parsererror') return true
  return childElements(root).some((child) => child.nodeName.toLowerCase() === 'parsererror')
}

function attr(element: Element, name: string): string {
  return element.getAttribute(name) ?? ''
}

function parseBpm(raw: string): number | null {
  if (!raw.trim()) return null
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

function parseDuration(raw: string): number | undefined {
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

export function decodeLocation(raw: string): string | undefined {
  if (!raw.trim()) return undefined
  let path = raw.trim()
  path = path.replace(/^file:\/\/(localhost)?/i, '')
  try {
    path = decodeURIComponent(path)
  } catch {
    // Broken percent-encoding: keep the raw path so the track still shows up.
  }
  if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1)
  return path || undefined
}

function fileExtension(path: string | undefined): string | undefined {
  if (!path) return undefined
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(path)
  return match ? match[1].toLowerCase() : undefined
}

function readTrack(element: Element): Track | null {
  const id = attr(element, 'TrackID').trim()
  if (!id) return null

  const location = decodeLocation(attr(element, 'Location'))
  const genre = attr(element, 'Genre').trim()

  return {
    id,
    title: attr(element, 'Name').trim() || 'Adsız parça',
    artist: attr(element, 'Artist').trim(),
    bpm: parseBpm(attr(element, 'AverageBpm')),
    key: toCamelot(attr(element, 'Tonality')),
    genre: genre || undefined,
    duration: parseDuration(attr(element, 'TotalTime')),
    location,
    source: 'library',
    ext: fileExtension(location),
  }
}

function collectPlaylists(
  node: Element,
  trail: string[],
  known: Set<string>,
  out: Playlist[],
  counters: { ghosts: number },
): void {
  for (const child of childElements(node, 'NODE')) {
    const name = attr(child, 'Name').trim()
    if (attr(child, 'Type') === '0') {
      const nextTrail = name && name.toUpperCase() !== 'ROOT' ? [...trail, name] : trail
      collectPlaylists(child, nextTrail, known, out, counters)
      continue
    }

    const trackIds: string[] = []
    for (const entry of childElements(child, 'TRACK')) {
      const key = attr(entry, 'Key').trim()
      if (!key) continue
      if (!known.has(key)) {
        counters.ghosts += 1
        continue
      }
      trackIds.push(key)
    }

    out.push({
      id: `${out.length + 1}:${[...trail, name].join(' / ')}`,
      name: [...trail, name].filter(Boolean).join(' / ') || 'Adsız playlist',
      trackIds,
    })
  }
}

export function parseRekordboxXml(text: string, parseXml: XmlParser = defaultParseXml): RekordboxLibrary {
  if (typeof text !== 'string' || !text.trim()) {
    throw new RekordboxParseError(
      'Dosya boş görünüyor. rekordbox\u2019ta Dosya → Koleksiyonu dışa aktar ile yeni bir XML çıkarıp onu seç.',
    )
  }

  let doc: Document
  try {
    doc = parseXml(text)
  } catch {
    throw new RekordboxParseError(
      'Dosya XML olarak okunamadı. rekordbox\u2019un dışa aktardığı .xml dosyasını seçtiğinden emin ol; .txt ya da .m3u8 çalışmaz.',
    )
  }

  if (hasParserError(doc)) {
    throw new RekordboxParseError(
      'XML bozuk ya da yarım. Dosyayı rekordbox\u2019tan yeniden dışa aktar; aktarım sırasında programı kapatma.',
    )
  }

  const root = doc.documentElement
  if (!root || root.nodeName !== 'DJ_PLAYLISTS') {
    throw new RekordboxParseError(
      `Bu bir rekordbox koleksiyon dosyası değil (kök etiket DJ_PLAYLISTS olmalı, bulunan: ${root?.nodeName ?? 'yok'}). rekordbox → Dosya → Koleksiyonu dışa aktar çıktısını seç.`,
    )
  }

  const collection = firstChild(root, 'COLLECTION')
  if (!collection) {
    throw new RekordboxParseError(
      'Dosyada COLLECTION bölümü yok. rekordbox\u2019ta dışa aktarırken "Koleksiyon" seçeneğinin işaretli olduğundan emin ol.',
    )
  }

  const trackElements = childElements(collection, 'TRACK')
  const tracks: Track[] = []
  let skipped = 0
  for (const element of trackElements) {
    const track = readTrack(element)
    if (track) tracks.push(track)
    else skipped += 1
  }

  if (tracks.length === 0) {
    throw new RekordboxParseError(
      'Koleksiyonda hiç parça bulunamadı. rekordbox\u2019ta parçaların koleksiyona eklendiğinden ve dışa aktarıma dahil edildiğinden emin ol.',
    )
  }

  const known = new Set(tracks.map((track) => track.id))
  const playlists: Playlist[] = []
  const counters = { ghosts: 0 }
  const playlistsNode = firstChild(root, 'PLAYLISTS')
  if (playlistsNode) collectPlaylists(playlistsNode, [], known, playlists, counters)

  const product = firstChild(root, 'PRODUCT')

  return {
    tracks,
    playlists,
    version: product ? attr(product, 'Version').trim() || null : null,
    stats: {
      total: trackElements.length,
      skipped,
      missingBpm: tracks.filter((track) => track.bpm === null).length,
      missingKey: tracks.filter((track) => track.key === null).length,
      missingLocation: tracks.filter((track) => !track.location).length,
      ghostReferences: counters.ghosts,
    },
  }
}

export function isUsable(track: Track): boolean {
  return track.bpm !== null && track.key !== null
}

export function toM3u8(tracks: Track[], name: string): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${name}`]
  for (const track of tracks) {
    if (!track.location) continue
    const duration = track.duration ?? -1
    const artist = track.artist ? `${track.artist} - ` : ''
    lines.push(`#EXTINF:${duration},${artist}${track.title}`)
    lines.push(track.location)
  }
  return `${lines.join('\n')}\n`
}
