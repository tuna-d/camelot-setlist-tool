import type { VercelRequest, VercelResponse } from '@vercel/node'
import { refreshCatalog } from '../src/lib/catalog'
import type { Catalog } from '../src/lib/types'
import {
  CATALOG_PATH,
  applyCors,
  hasBlobToken,
  isAuthorized,
  isCronRequest,
  readJson,
  sendError,
  sendJson,
  writeJson,
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

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (applyCors(request, response)) return

  const stored = await readJson<Catalog>(CATALOG_PATH)

  if (!wantsRefresh(request)) {
    if (!isAuthorized(request)) {
      sendError(response, 401, 'Bu uç nokta APP_SECRET ile korunuyor. VITE_APP_SECRET değerinin aynı olduğundan emin ol.')
      return
    }
    if (!stored) {
      response.status(404).json({
        error: 'Sunucuda katalog yok; uygulama public/catalog.json dosyasına düşecek. Tazelemek için /api/catalog?refresh=1 çalıştır.',
      })
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

  if (result.ok && result.catalog) {
    const written = await writeJson(CATALOG_PATH, result.catalog)
    sendJson(response, 200, {
      ok: true,
      stored: written,
      tracks: result.catalog.tracks.length,
      strategy: result.catalog.strategy,
      reports: result.reports,
      note: written || !hasBlobToken() ? undefined : 'Katalog yazılamadı.',
    })
    return
  }

  // Doğrulama geçmedi: eski katalog olduğu gibi kalıyor.
  sendJson(response, 200, {
    ok: false,
    kept: stored ? stored.tracks.length : 0,
    reasons: result.validation.reasons,
    reports: result.reports,
  })
}
