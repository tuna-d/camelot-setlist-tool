import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAppState } from '../src/lib/state'
import type { AppState } from '../src/lib/types'
import {
  NO_BLOB_MESSAGE,
  STATE_PATH,
  applyCors,
  hasBlobToken,
  isAuthorized,
  readJson,
  sendError,
  sendJson,
  writeJson,
} from './_lib'

function parseBody(body: unknown): unknown {
  if (typeof body !== 'string') return body
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (applyCors(request, response)) return

  if (!isAuthorized(request)) {
    sendError(response, 401, 'Bu uç nokta APP_SECRET ile korunuyor. VITE_APP_SECRET değerinin aynı olduğundan emin ol.')
    return
  }

  if (!hasBlobToken()) {
    sendError(response, 501, NO_BLOB_MESSAGE)
    return
  }

  if (request.method === 'GET') {
    const stored = await readJson<AppState>(STATE_PATH)
    if (!stored) {
      response.status(404).json({ error: 'Sunucuda kayıt yok. İlk kaydı yaptığında oluşacak.' })
      return
    }
    sendJson(response, 200, stored)
    return
  }

  if (request.method === 'PUT') {
    const incoming = parseBody(request.body)
    if (!isAppState(incoming)) {
      sendError(response, 400, 'Gönderilen kayıt beklenen biçimde değil. Sayfayı yenileyip tekrar dene.')
      return
    }

    // Sunucudaki kayıt daha yeniyse üzerine yazma: karşı taraf o kaydı alıp devam etsin.
    const stored = await readJson<AppState>(STATE_PATH)
    if (stored && stored.savedAt > incoming.savedAt) {
      sendJson(response, 409, stored)
      return
    }

    await writeJson(STATE_PATH, incoming)
    sendJson(response, 200, { ok: true, savedAt: incoming.savedAt })
    return
  }

  sendError(response, 405, `${request.method ?? 'Bu'} yöntemi desteklenmiyor; GET ya da PUT kullan.`)
}
