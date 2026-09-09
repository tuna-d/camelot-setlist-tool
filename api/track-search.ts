import type { VercelRequest, VercelResponse } from '@vercel/node'
import { applyCors, readUserId, sendJson } from './_lib.js'

/**
 * Thin authenticated proxy. Vercel compiles the files under api/ on their own and
 * does not follow imports into src/lib, so the query is split and the answer parsed
 * in the browser (splitQuery / readSearchResults); this only holds the API key.
 */

const ENDPOINT = 'https://api.getsong.co/search/'

function param(request: VercelRequest, name: string): string {
  const value = request.query[name]
  if (Array.isArray(value)) return (value[0] ?? '').trim()
  return (value ?? '').trim()
}

function searchUrl(song: string, artist: string, apiKey: string): string {
  const lookup = artist ? `song:${song} artist:${artist}` : `song:${song}`
  // URLSearchParams encodes a space as "+"; the service expects %20.
  return `${ENDPOINT}?api_key=${encodeURIComponent(apiKey)}&type=both&lookup=${encodeURIComponent(lookup)}`
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (applyCors(request, response)) return

  // The search quota is a shared resource: only signed-in users may spend it.
  const userId = await readUserId(request)
  if (!userId) {
    sendJson(response, 200, {
      raw: null,
      configured: true,
      message: 'You need to sign in to search the web. You can also enter the track by hand.',
    })
    return
  }

  const song = param(request, 'song')
  const artist = param(request, 'artist')
  if (song.length < 2) {
    sendJson(response, 200, { raw: null, configured: true, message: 'Type at least two letters.' })
    return
  }

  const apiKey = process.env.GETSONGBPM_API_KEY ?? ''
  // A missing key is not an error: the UI explains it and points at manual entry.
  if (!apiKey) {
    sendJson(response, 200, {
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
      sendJson(response, 200, {
        raw: null,
        configured: true,
        message: `The search service did not answer (HTTP ${upstream.status}). Try again shortly, or enter the track by hand.`,
      })
      return
    }

    sendJson(response, 200, { raw: await upstream.json(), configured: true, message: null })
  } catch {
    sendJson(response, 200, {
      raw: null,
      configured: true,
      message: 'Could not reach the search service. Check the connection, or enter the track by hand.',
    })
  }
}
