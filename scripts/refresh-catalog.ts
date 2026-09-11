import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { BEATPORT_GENRES } from '../src/lib/beatport'
import {
  CATALOG_ID,
  DEFAULT_MAX_CHARTS,
  formatReports,
  isCatalog,
  refreshCatalog,
  refreshFromVolumo,
} from '../src/lib/catalog'
import { parseEnvFile } from '../src/lib/env-file'
import type { Catalog } from '../src/lib/types'

const TARGET = resolve(process.cwd(), 'public/catalog.json')
const ENV_FILE = resolve(process.cwd(), '.env')

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

function readExisting(): Catalog | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(TARGET, 'utf8'))
    return isCatalog(parsed) ? parsed : null
  } catch {
    return null
  }
}

function readEnv(name: string): string {
  const fromProcess = process.env[name]?.trim()
  if (fromProcess) return fromProcess
  try {
    return parseEnvFile(readFileSync(ENV_FILE, 'utf8'))[name]?.trim() ?? ''
  } catch {
    return ''
  }
}

/** An expected stop with a message for the person running the script, not a crash. */
class Fail extends Error {}

async function pushToSupabase(catalog: Catalog): Promise<void> {
  const url = readEnv('SUPABASE_URL')
  const key = readEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !key) {
    throw new Fail(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not found. Put both in .env' +
        ' (Supabase → Settings → API Keys; use a secret key) or export them before the command.',
    )
  }

  const client = createClient(url, key, { auth: { persistSession: false } })
  const { error } = await client.from('catalog').upsert({
    id: CATALOG_ID,
    tracks: catalog.tracks,
    source: catalog.source,
    strategy: catalog.strategy,
    updated_at: catalog.updatedAt,
  })

  if (error) {
    throw new Fail(
      `Could not write the catalog to the table: ${error.message}.` +
        ' Check that SUPABASE_SERVICE_ROLE_KEY holds a current secret key (sb_secret_…) and that' +
        ' supabase/schema.sql has been run.',
    )
  }

  console.log(`Supabase catalog table updated (${catalog.tracks.length} tracks).`)
}


// One request every second and a half: nothing on their side asks for it, but a
// weekly catalog refresh has no reason to hurry.
const CHART_DELAY_MS = 1500

function wait(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms))
}

async function withCourtesy(previous: Catalog | null) {
  console.log(`Walking up to ${DEFAULT_MAX_CHARTS} Volumo charts…`)
  let first = true
  return refreshFromVolumo({
    previous,
    fetcher: async (url) => {
      if (!first) await wait(CHART_DELAY_MS)
      first = false
      return fetchPage(url)
    },
  })
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry')
  const push = process.argv.includes('--supabase')
  const fromFile = process.argv.includes('--from-file')

  if (fromFile) {
    if (!push) throw new Fail('--from-file only makes sense with --supabase: it uploads the existing file.')
    const existing = readExisting()
    if (!existing) {
      throw new Fail(
        'public/catalog.json could not be read, or is not a valid catalog. Run without --from-file first to produce the file.',
      )
    }
    console.log(`Uploading public/catalog.json (${existing.tracks.length} tracks)…`)
    await pushToSupabase(existing)
    return
  }

  const previous = readExisting()
  const volumo = !process.argv.includes('--source=beatport')

  // Volumo is the default source: Beatport has answered 403 to this scraper
  // since September 2026. Ask for beatport explicitly to test whether it is back.
  const result = volumo
    ? await withCourtesy(previous)
    : await (async () => {
        console.log(`Fetching ${BEATPORT_GENRES.length} genres…`)
        return refreshCatalog(fetchPage, previous)
      })()
  console.log(formatReports(result))

  if (!result.ok || !result.catalog) {
    throw new Fail(
      'Validation failed, public/catalog.json and the table were left alone. Look at the reasons above;' +
        ` if the page structure changed, the fix belongs in src/lib/${volumo ? 'volumo' : 'beatport'}.ts.`,
    )
  }

  if (dry) {
    console.log('\n--dry given: no file written, the table was not touched.')
    return
  }

  writeFileSync(TARGET, `${JSON.stringify(result.catalog, null, 2)}\n`)
  console.log(`\npublic/catalog.json updated (${result.catalog.tracks.length} tracks).`)

  if (push) await pushToSupabase(result.catalog)
}

main().catch((error: unknown) => {
  if (error instanceof Fail) console.error(`\n${error.message}`)
  else console.error(`Refresh crashed: ${error instanceof Error ? error.message : String(error)}`)
  // exitCode rather than process.exit(): exiting while a fetch socket is still
  // closing trips a libuv assertion on Windows and buries the real message.
  process.exitCode = 1
})
