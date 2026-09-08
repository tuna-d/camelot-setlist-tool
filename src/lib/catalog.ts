import { BEATPORT_GENRES, extractTracks, genreUrl, validateCatalog } from './beatport'
import type { BeatportGenre, ExtractResult, ValidationResult } from './beatport'
import { dedupeBySignature } from './search'
import type { Catalog, Track } from './types'

export type CatalogFetcher = (url: string) => Promise<string>

export interface GenreReport {
  genre: string
  url: string
  count: number
  strategy: ExtractResult['strategy']
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
            ? 'Sayfadan hiç parça çıkarılamadı. Sayfa yapısı değişmiş olabilir; beatport.ts içindeki stratejileri gözden geçir.'
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

export function formatReports(result: RefreshResult): string {
  const lines = result.reports.map((report) =>
    report.error
      ? `  ✗ ${report.genre}: ${report.error}`
      : `  ✓ ${report.genre}: ${report.count} parça (${report.strategy})`,
  )
  lines.push(
    `  toplam ${result.candidate.tracks.length} parça · key okunma %${Math.round(
      result.validation.stats.keyRate * 100,
    )} · ${result.validation.stats.genreCount} tür`,
  )
  if (!result.ok) {
    lines.push('  doğrulama geçmedi:')
    for (const reason of result.validation.reasons) lines.push(`   · ${reason}`)
  }
  return lines.join('\n')
}
