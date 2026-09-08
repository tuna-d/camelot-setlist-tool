import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readSearchResults, searchUrl } from '../src/lib/getsongbpm'
import { applyCors, isAuthorized, sendError, sendJson } from './_lib'

function queryValue(request: VercelRequest): string {
  const value = request.query.q
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (applyCors(request, response)) return

  if (!isAuthorized(request)) {
    sendError(response, 401, 'Bu uç nokta APP_SECRET ile korunuyor. VITE_APP_SECRET değerinin aynı olduğundan emin ol.')
    return
  }

  const query = queryValue(request).trim()
  if (query.length < 2) {
    sendJson(response, 200, {
      results: [],
      configured: true,
      message: 'En az iki harf yaz.',
    })
    return
  }

  const apiKey = process.env.GETSONGBPM_API_KEY ?? ''
  // Anahtar yokluğu hata değil: arayüz bunu kullanıcıya anlatıp elle girişe yönlendiriyor.
  if (!apiKey) {
    sendJson(response, 200, {
      results: [],
      configured: false,
      message:
        'İnternet araması kapalı: GETSONGBPM_API_KEY tanımlı değil. getsongbpm.com/api adresinden ücretsiz anahtar alıp Vercel ortam değişkenlerine ekle; o zamana kadar parçayı elle girebilirsin.',
    })
    return
  }

  try {
    const upstream = await fetch(searchUrl(query, apiKey), {
      headers: { accept: 'application/json' },
    })
    if (!upstream.ok) {
      sendJson(response, 200, {
        results: [],
        configured: true,
        message: `Arama servisi yanıt vermedi (HTTP ${upstream.status}). Biraz sonra tekrar dene ya da parçayı elle gir.`,
      })
      return
    }

    const parsed = readSearchResults(await upstream.json())
    sendJson(response, 200, { results: parsed.results, configured: true, message: parsed.message })
  } catch {
    sendJson(response, 200, {
      results: [],
      configured: true,
      message: 'Arama servisine ulaşılamadı. Bağlantıyı kontrol et ya da parçayı elle gir.',
    })
  }
}
