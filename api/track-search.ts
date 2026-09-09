import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Authenticated proxy, deliberately self-contained (see api/catalog.ts).
 *
 * It only holds the API key: the query is split and the answer parsed in the
 * browser by splitQuery / readSearchResults, so that logic has one tested copy.
 */

const ENDPOINT = 'https://api.getsong.co/search/'

function param(request: VercelRequest, name: string): string {
  const value = request.query[name]
  if (Array.isArray(value)) return (value[0] ?? '').trim()
  return (value ?? '').trim()
}

function searchUrl(song: string, artist: string, apiKey: string): string {
  const lookup = artist ? `song:${song} artist:${artist}` : `song:${song}`
  return `${ENDPOINT}?api_key=${encodeURIComponent(apiKey)}&type=both&lookup=${encodeURIComponent(lookup)}`
}

/** Id of the session owner; `null` when the header is missing or the token is invalid. */
async function readUserId(request: VercelRequest): Promise<string | null> {
  const url = process.env.SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) return null

  const header = request.headers.authorization
  const raw = Array.isArray(header) ? (header[0] ?? '') : (header ?? '')
  const token = raw.replace(/^Bearer\s+/i, '')
  if (!token) return null

  const client = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await client.auth.getUser(token)
  return error ? null : (data.user?.id ?? null)
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader('access-control-allow-origin', request.headers.origin ?? '*')
  response.setHeader('access-control-allow-methods', 'GET,OPTIONS')
  response.setHeader('access-control-allow-headers', 'content-type,authorization')
  response.setHeader('cache-control', 'no-store')
  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }

  // The search quota is a shared resource: only signed-in users may spend it.
  const userId = await readUserId(request)
  if (!userId) {
    response.status(200).json({
      raw: null,
      configured: true,
      message: 'You need to sign in to search the web. You can also enter the track by hand.',
    })
    return
  }

  const song = param(request, 'song')
  const artist = param(request, 'artist')
  if (song.length < 2) {
    response.status(200).json({ raw: null, configured: true, message: 'Type at least two letters.' })
    return
  }

  const apiKey = process.env.GETSONGBPM_API_KEY ?? ''
  // A missing key is not an error: the UI explains it and points at manual entry.
  if (!apiKey) {
    response.status(200).json({
      raw: null,
      configured: false,
      message:
        'Web search is off: GETSONGBPM_API_KEY is not set. Get a free key at getsongbpm.com/api and add it to the Vercel environment variables; until then you can enter the track by hand.',
    })
    return
  }

  try {
    const upstream = await fetch(searchUrl(song, artist, apiKey), {
      headers: { accept: 'application/json' },
    })
    if (!upstream.ok) {
      response.status(200).json({
        raw: null,
        configured: true,
        message: `The search service did not answer (HTTP ${upstream.status}). Try again shortly, or enter the track by hand.`,
      })
      return
    }

    response.status(200).json({ raw: await upstream.json(), configured: true, message: null })
  } catch {
    response.status(200).json({
      raw: null,
      configured: true,
      message: 'Could not reach the search service. Check the connection, or enter the track by hand.',
    })
  }
}
