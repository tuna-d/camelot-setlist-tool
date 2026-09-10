import { BEATPORT_GENRES, extractTracks, genreUrl, validateCatalog } from './beatport'
import type { BeatportGenre, ExtractResult, ValidationResult } from './beatport'
import { dedupeBySignature } from './search'
import { VOLUMO_CHARTS, extractChartLinks, extractTracks as extractVolumoTracks } from './volumo'
import type { Catalog, Track } from './types'

/** The catalog table holds a single row; its id is fixed. */
export const CATALOG_ID = 'current'

export type CatalogFetcher = (url: string) => Promise<string>

export interface GenreReport {
  genre: string
  url: string
  count: number
  strategy: ExtractResult['strategy'] | 'volumo-chart'
  error: string | null
}

export interface RefreshResult {
  ok: boolean
  catalog: Catalog | null
  candidate: Catalog
  reports: GenreReport[]
  validation: ValidationResult
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export async function refreshCatalog(
  fetcher: CatalogFetcher,
  previous: Catalog | null = null,
  genres: BeatportGenre[] = BEATPORT_GENRES,
): Promise<RefreshResult> {
  const reports: GenreReport[] = []
  const collected: Track[] = []

  for (const genre of genres) {
    const url = genreUrl(genre)
    try {
      const html = await fetcher(url)
      const result = extractTracks(html, genre.label)
      collected.push(...result.tracks)
      reports.push({
        genre: genre.label,
        url,
        count: result.tracks.length,
        strategy: result.strategy,
        error:
          result.tracks.length === 0
            ? 'No tracks could be extracted from the page. The page structure may have changed; review the strategies in beatport.ts.'
            : null,
      })
    } catch (error) {
      reports.push({
        genre: genre.label,
        url,
        count: 0,
        strategy: 'none',
        error: errorMessage(error),
      })
    }
  }

  const tracks = dedupeBySignature(collected)
  const strategies = [...new Set(reports.filter((r) => r.count > 0).map((r) => r.strategy))]

  const candidate: Catalog = {
    updatedAt: new Date().toISOString(),
    source: 'beatport',
    strategy: strategies.length > 0 ? strategies.join('+') : 'none',
    tracks,
  }

  const validation = validateCatalog(tracks, previous?.tracks ?? [])

  return {
    ok: validation.ok,
    catalog: validation.ok ? candidate : previous,
    candidate,
    reports,
    validation,
  }
}

export interface VolumoOptions {
  fetcher: CatalogFetcher
  previous?: Catalog | null
  /** How many chart pages to walk. Each holds ~15 tracks. */
  maxCharts?: number
  onStep?: (message: string) => void
}

export const DEFAULT_MAX_CHARTS = 25

/** Upper bound on the accumulated catalog, oldest entries dropping off the end. */
export const CATALOG_CAP = 2000

/**
 * Volumo publishes dozens of DJ charts, each a short list with tempo, key and
 * genre already in the page. Walking a slice of them gives a catalog of the same
 * size as the old Beatport scrape without a second lookup service.
 */
export async function refreshFromVolumo(options: VolumoOptions): Promise<RefreshResult> {
  const { fetcher, previous = null, maxCharts = DEFAULT_MAX_CHARTS, onStep } = options
  const reports: GenreReport[] = []
  const collected: Track[] = []

  let links: string[] = []
  try {
    links = extractChartLinks(await fetcher(VOLUMO_CHARTS)).slice(0, maxCharts)
  } catch (error) {
    reports.push({
      genre: 'chart index',
      url: VOLUMO_CHARTS,
      count: 0,
      strategy: 'none',
      error: errorMessage(error),
    })
  }

  if (links.length === 0 && reports.length === 0) {
    reports.push({
      genre: 'chart index',
      url: VOLUMO_CHARTS,
      count: 0,
      strategy: 'none',
      error: 'No chart links on the index page. The page structure may have changed; the fix belongs in extractChartLinks.',
    })
  }

  for (const url of links) {
    try {
      onStep?.(url)
      const tracks = extractVolumoTracks(await fetcher(url))
      collected.push(...tracks)
      reports.push({
        genre: chartName(url),
        url,
        count: tracks.length,
        strategy: 'volumo-chart',
        error:
          tracks.length === 0
            ? 'No tracks could be extracted from this chart. The page structure may have changed; review extractTracks in volumo.ts.'
            : null,
      })
    } catch (error) {
      reports.push({ genre: chartName(url), url, count: 0, strategy: 'none', error: errorMessage(error) })
    }
  }

  const fresh = dedupeBySignature(collected)

  // The charts are small and change weekly, so a run adds to the catalog instead
  // of replacing it: the pool grows and one bad run can never shrink it. The
  // freshly read tracks are what gets validated — merging would hide a failure.
  const merged = dedupeBySignature([...fresh, ...(previous?.tracks ?? [])]).slice(0, CATALOG_CAP)

  const candidate: Catalog = {
    updatedAt: new Date().toISOString(),
    source: 'volumo',
    strategy: fresh.length > 0 ? 'volumo-chart' : 'none',
    tracks: merged,
  }
  const validation = validateCatalog(fresh, [])

  return {
    ok: validation.ok,
    catalog: validation.ok ? candidate : previous,
    candidate,
    reports,
    validation,
  }
}

/** The readable half of a chart address, for the report lines. */
function chartName(url: string): string {
  const slug = url.split('/chart/')[1] ?? url
  return slug.replace(/^[a-z0-9]+-/i, '').replace(/-/g, ' ')
}

export function formatReports(result: RefreshResult): string {
  const lines = result.reports.map((report) =>
    report.error
      ? `  ✗ ${report.genre}: ${report.error}`
      : `  ✓ ${report.genre}: ${report.count} tracks (${report.strategy})`,
  )
  lines.push(
    `  ${result.candidate.tracks.length} tracks total · key parse ${Math.round(
      result.validation.stats.keyRate * 100,
    )}% · ${result.validation.stats.genreCount} genres`,
  )
  if (!result.ok) {
    lines.push('  validation failed:')
    for (const reason of result.validation.reasons) lines.push(`   · ${reason}`)
  }
  return lines.join('\n')
}

export function isCatalog(value: unknown): value is Catalog {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.tracks)) return false
  return record.tracks.every((item) => {
    if (!item || typeof item !== 'object') return false
    const track = item as Record<string, unknown>
    return typeof track.id === 'string' && typeof track.title === 'string'
  })
}
