import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readSearchResults, searchUrl } from '../src/lib/getsongbpm'
import { applyCors, readUserId, sendJson } from './_lib'

function queryValue(request: VercelRequest): string {
  const value = request.query.q
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (applyCors(request, response)) return

  // The search quota is a shared resource: only signed-in users may spend it.
  const userId = await readUserId(request)
  if (!userId) {
    sendJson(response, 200, {
      results: [],
      configured: true,
      message: 'You need to sign in to search the web. You can also enter the track by hand.',
    })
    return
  }

  const query = queryValue(request).trim()
  if (query.length < 2) {
    sendJson(response, 200, { results: [], configured: true, message: 'En az iki harf yaz.' })
    return
  }

  const apiKey = process.env.GETSONGBPM_API_KEY ?? ''
  // A missing key is not an error: the UI explains it and points at manual entry.
  if (!apiKey) {
    sendJson(response, 200, {
      results: [],
      configured: false,
      message:
        'Web search is off: GETSONGBPM_API_KEY is not set. Get a free key at getsongbpm.com/api and add it to the Vercel environment variables; until then you can enter the track by hand.',
    })
    return
  }

  try {
    const upstream = await fetch(searchUrl(query, apiKey), { headers: { accept: 'application/json' } })
    if (!upstream.ok) {
      sendJson(response, 200, {
        results: [],
        configured: true,
        message: `The search service did not answer (HTTP ${upstream.status}). Try again shortly, or enter the track by hand.`,
      })
      return
    }

    const parsed = readSearchResults(await upstream.json())
    sendJson(response, 200, { results: parsed.results, configured: true, message: parsed.message })
  } catch {
    sendJson(response, 200, {
      results: [],
      configured: true,
      message: 'Could not reach the search service. Check the connection, or enter the track by hand.',
    })
  }
}
