import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
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

/**
 * The environment variable is foreign data too: a value pasted with a missing
 * scheme, a stray quote or a newline used to crash the whole function with
 * "Invalid supabaseUrl". Fail with an answer that says what to fix instead.
 */
function connect(): { client: SupabaseClient | null; problem: string | null } {
  const url = (process.env.SUPABASE_URL ?? '').trim().replace(/^["']|["']$/g, '')
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

  if (!url || !key) {
    return {
      client: null,
      problem:
        'The server side is not connected to Supabase. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to the Vercel environment variables.',
    }
  }

  if (!/^https?:\/\//i.test(url)) {
    return {
      client: null,
      problem: `SUPABASE_URL does not start with https:// (it reads "${url}"). Set it to the Project URL exactly as Supabase shows it, for example https://your-ref.supabase.co`,
    }
  }

  try {
    return { client: createClient(url, key, { auth: { persistSession: false } }), problem: null }
  } catch (error) {
    return {
      client: null,
      problem: `SUPABASE_URL is not a usable address: ${error instanceof Error ? error.message : String(error)}. Copy the Project URL from Supabase → Settings → API without a trailing path.`,
    }
  }
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

  const { client, problem } = connect()
  if (!client) {
    response.status(501).json({ error: problem })
    return
  }

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
