import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Read-only, and deliberately self-contained.
 *
 * Vercel compiles each route file under api/ on its own; it does not follow
 * imports into src/lib, and a shared helper beside it is not guaranteed to be
 * compiled either. So this file imports nothing but the Supabase package.
 * The Beatport scraper lives in .github/workflows/refresh-catalog.yml instead.
 */

const CATALOG_ID = 'current'

interface CatalogRow {
  tracks: unknown
  source: string | null
  strategy: string | null
  updated_at: string
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

  const url = process.env.SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) {
    response.status(501).json({
      error:
        'The server side is not connected to Supabase. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to the Vercel environment variables.',
    })
    return
  }

  const client = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await client
    .from('catalog')
    .select('tracks, source, strategy, updated_at')
    .eq('id', CATALOG_ID)
    .maybeSingle()

  if (error) {
    response.status(502).json({
      error: `Could not read the catalog: ${error.message}. The app falls back to public/catalog.json.`,
    })
    return
  }

  const row = data as CatalogRow | null
  if (!row || !Array.isArray(row.tracks)) {
    response.status(404).json({
      error:
        'No catalog on the server; the app falls back to public/catalog.json. Run `npm run seed:catalog` to fill the table.',
    })
    return
  }

  response.status(200).json({
    updatedAt: row.updated_at,
    source: row.source ?? 'beatport',
    strategy: row.strategy ?? 'unknown',
    tracks: row.tracks,
  })
}
