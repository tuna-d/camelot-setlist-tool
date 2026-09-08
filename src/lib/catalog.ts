/**
 * Keşif katalogunun tazelenmesi: tür sayfalarını çeker, çıkarır, doğrular.
 *
 * `fetcher` dışarıdan veriliyor — testler gerçek ağa çıkmasın, sunucu tarafı
 * kendi istemcisini versin diye. Tek bir türün hatası tazelemeyi düşürmez:
 * her tür için ayrı rapor satırı üretilir.
 */

import { BEATPORT_GENRES, extractTracks, genreUrl, validateCatalog } from './beatport'
import type { BeatportGenre, ExtractResult, ValidationResult } from './beatport'
import { dedupeBySignature } from './search'
import type { Catalog, Track } from './types'

export type CatalogFetcher = (url: string) => Promise<string>

export interface GenreReport {
  genre: string
  url: string
  /** Bu türden alınan parça sayısı. */
  count: number
  strategy: ExtractResult['strategy']
  /** Tür çekilemediyse ne olduğu; başarılıysa `null`. */
  error: string | null
}

export interface RefreshResult {
  ok: boolean
  /** Yayına alınacak katalog: doğrulama geçtiyse yeni, geçmediyse eski (ya da `null`). */
  catalog: Catalog | null
  /** Doğrulama geçtiyse yeni katalog, geçmediyse yine de incelenebilsin diye burada. */
  candidate: Catalog
  reports: GenreReport[]
  validation: ValidationResult
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Tür sayfalarını sırayla çeker ve tek bir katalog üretir.
 * Doğrulama geçmezse `catalog` alanında **eski** katalog döner: bozuk veri
 * iyi veriyi ezmesin. Neden geçmediği `validation.reasons` içinde yazıyor.
 */
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
      // Tek türün hatası diğerlerini düşürmesin; rapor satırında görünsün yeter.
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

/** Rapor satırlarını konsola/terminale yazdırılabilir tek metne çevirir. */
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
