import type { VercelRequest, VercelResponse } from '@vercel/node'
import { refreshCatalog } from '../src/lib/catalog'
import type { Catalog } from '../src/lib/types'
import {
  CATALOG_ID,
  NO_SUPABASE_MESSAGE,
  applyCors,
  getServiceClient,
  isCronRequest,
  sendError,
  sendJson,
} from './_lib'

const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, { headers: BROWSER_HEADERS })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

function wantsRefresh(request: VercelRequest): boolean {
  if (request.method === 'POST') return true
  const value = request.query.refresh
  const flag = Array.isArray(value) ? value[0] : value
  return flag === '1' || flag === 'true'
}

async function readStored(): Promise<Catalog | null> {
  const client = getServiceClient()
  if (!client) return null
  const { data, error } = await client
    .from('catalog')
    .select('tracks, source, strategy, updated_at')
    .eq('id', CATALOG_ID)
    .maybeSingle()
  if (error || !data) return null
  const row = data as { tracks: unknown; source: string | null; strategy: string | null; updated_at: string }
  if (!Array.isArray(row.tracks)) return null
  return {
    updatedAt: row.updated_at,
    source: row.source ?? 'beatport',
    strategy: row.strategy ?? 'unknown',
    tracks: row.tracks as Catalog['tracks'],
  }
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (applyCors(request, response)) return

  const client = getServiceClient()
  if (!client) {
    sendError(response, 501, NO_SUPABASE_MESSAGE)
    return
  }

  const stored = await readStored()

  if (!wantsRefresh(request)) {
    if (!stored) {
      sendError(
        response,
        404,
        'Sunucuda katalog yok; uygulama public/catalog.json dosyasına düşecek. Tazelemek için /api/catalog?refresh=1 çalıştır.',
      )
      return
    }
    sendJson(response, 200, stored)
    return
  }

  // Tazeleme yalnızca cron sırrıyla: dışarıdan tetiklenip Beatport'a yük bindirilmesin.
  if (!isCronRequest(request)) {
    sendError(
      response,
      401,
      'Tazeleme için CRON_SECRET gerekiyor. Vercel cron bunu Authorization başlığında gönderiyor; elle çalıştırmak için aynı başlığı ekle.',
    )
    return
  }

  const result = await refreshCatalog(fetchPage, stored)

  if (!result.ok || !result.catalog) {
    // Doğrulama geçmedi: eski katalog olduğu gibi kalıyor.
    sendJson(response, 200, {
      ok: false,
      kept: stored ? stored.tracks.length : 0,
      reasons: result.validation.reasons,
      reports: result.reports,
    })
    return
  }

  const { error } = await client.from('catalog').upsert({
    id: CATALOG_ID,
    tracks: result.catalog.tracks,
    source: result.catalog.source,
    strategy: result.catalog.strategy,
    updated_at: result.catalog.updatedAt,
  })

  sendJson(response, 200, {
    ok: !error,
    stored: !error,
    tracks: result.catalog.tracks.length,
    strategy: result.catalog.strategy,
    reports: result.reports,
    error: error ? `Katalog yazılamadı: ${error.message}` : undefined,
  })
}
