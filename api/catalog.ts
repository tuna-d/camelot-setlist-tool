import type { VercelRequest, VercelResponse } from '@vercel/node'
import { CATALOG_ID, NO_SUPABASE_MESSAGE, applyCors, getServiceClient, sendError, sendJson } from './_lib.js'

/**
 * Read-only on purpose. Vercel compiles the files under api/ on their own and
 * does not follow imports into src/lib, so the Beatport scraper cannot live here;
 * the weekly refresh runs in .github/workflows/refresh-catalog.yml instead.
 */

interface CatalogRow {
  tracks: unknown
  source: string | null
  strategy: string | null
  updated_at: string
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (applyCors(request, response)) return

  const client = getServiceClient()
  if (!client) {
    sendError(response, 501, NO_SUPABASE_MESSAGE)
    return
  }

  const { data, error } = await client
    .from('catalog')
    .select('tracks, source, strategy, updated_at')
    .eq('id', CATALOG_ID)
    .maybeSingle()

  if (error) {
    sendError(
      response,
      502,
      `Could not read the catalog: ${error.message}. The app falls back to public/catalog.json.`,
    )
    return
  }

  const row = data as CatalogRow | null
  if (!row || !Array.isArray(row.tracks)) {
    sendError(
      response,
      404,
      'No catalog on the server; the app falls back to public/catalog.json. Run `npm run seed:catalog` to fill the table.',
    )
    return
  }

  sendJson(response, 200, {
    updatedAt: row.updated_at,
    source: row.source ?? 'beatport',
    strategy: row.strategy ?? 'unknown',
    tracks: row.tracks,
  })
}
