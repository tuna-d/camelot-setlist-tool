import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { BEATPORT_GENRES } from '../src/lib/beatport'
import { CATALOG_ID, formatReports, isCatalog, refreshCatalog } from '../src/lib/catalog'
import { collectFromCharts, mergeCatalog, validateDiscovery } from '../src/lib/discovery'
import { parseEnvFile } from '../src/lib/env-file'
import { readSearchResults, searchUrl } from '../src/lib/getsongbpm'
import type { SongHit } from '../src/lib/getsongbpm'
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

async function pushToSupabase(catalog: Catalog): Promise<void> {
  const url = readEnv('SUPABASE_URL')
  const key = readEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !key) {
    console.error(
      '\nSUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not found. Put both in .env\n' +
        '(the values live in Supabase → Project Settings → API) or export them before the command.',
    )
    process.exit(1)
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
    console.error(
      `\nCould not write the catalog to the table: ${error.message}\n` +
        'Check that the key is the service_role one and that supabase/schema.sql has been run.',
    )
    process.exit(1)
  }

  console.log(`Supabase catalog table updated (${catalog.tracks.length} tracks).`)
}


// ——— 1001tracklists charts, enriched through GetSongBPM ———

const CHART_PAGES = [
  'https://www.1001tracklists.com/charts/weekly/index.html',
  'https://www.1001tracklists.com/charts/trending/index.html',
]

// Their robots.txt asks for 8 seconds between requests; the lookup service gets
// a gentler pause because we make one call per chart entry.
const CHART_DELAY_MS = 8000
const LOOKUP_DELAY_MS = 400

function wait(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms))
}

async function collectCharts(previous: Catalog | null): Promise<Catalog | null> {
  const apiKey = readEnv('GETSONGBPM_API_KEY')
  if (!apiKey) {
    console.error(
      'GETSONGBPM_API_KEY not found. Put it in .env (the same key as in Vercel);' +
        ' chart names cannot be turned into tempo and key without it.',
    )
    process.exit(1)
  }

  let firstPage = true
  const fetchChart = async (url: string): Promise<string> => {
    if (!firstPage) await wait(CHART_DELAY_MS)
    firstPage = false
    console.log(`  reading ${url}`)
    const response = await fetch(url, { headers: BROWSER_HEADERS })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.text()
  }

  const lookup = async (query: string): Promise<SongHit[]> => {
    await wait(LOOKUP_DELAY_MS)
    const response = await fetch(searchUrl(query, apiKey), { headers: { accept: 'application/json' } })
    if (!response.ok) {
      // The body carries the real reason, e.g. "Invalid API Key, or inactive."
      throw new Error(`HTTP ${response.status} ${(await response.text()).slice(0, 120)}`)
    }
    return readSearchResults(await response.json()).results
  }

  console.log(`Reading ${CHART_PAGES.length} chart pages…`)
  const collected = await collectFromCharts({ pages: CHART_PAGES, fetchPage: fetchChart, lookup })

  for (const report of collected.reports) {
    console.log(report.error ? `  ✗ ${report.url}: ${report.error}` : `  ✓ ${report.url}: ${report.found} entries`)
  }
  console.log(`  ${collected.tracks.length}/${collected.entries.length} entries matched a tempo and key`)
  if (collected.unmatched.length > 0) {
    console.log(`  unmatched: ${collected.unmatched.slice(0, 8).join(' · ')}`)
  }

  if (collected.lookupError) {
    console.error(`
${collected.lookupError}`)
    return null
  }

  const validation = validateDiscovery(collected.tracks, collected.entries.length)
  if (!validation.ok) {
    console.error('\nValidation failed, nothing was written:')
    for (const reason of validation.reasons) console.error(` · ${reason}`)
    return null
  }

  const tracks = mergeCatalog(previous?.tracks ?? [], collected.tracks)
  console.log(`  catalog: ${previous?.tracks.length ?? 0} → ${tracks.length} tracks`)

  return {
    updatedAt: new Date().toISOString(),
    source: '1001tracklists+getsongbpm',
    strategy: 'charts',
    tracks,
  }
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry')
  const push = process.argv.includes('--supabase')
  const fromFile = process.argv.includes('--from-file')

  if (fromFile) {
    if (!push) {
      console.error('--from-file only makes sense with --supabase: it uploads the existing file.')
      process.exit(1)
    }
    const existing = readExisting()
    if (!existing) {
      console.error(
        'public/catalog.json could not be read, or is not a valid catalog.\n' +
          'Run without --from-file first to produce the file.',
      )
      process.exit(1)
    }
    console.log(`Uploading public/catalog.json (${existing.tracks.length} tracks)…`)
    await pushToSupabase(existing)
    return
  }

  const previous = readExisting()

  if (process.argv.includes('--source=tracklists')) {
    const catalog = await collectCharts(previous)
    if (!catalog) process.exit(1)

    if (dry) {
      console.log('\n--dry given: no file written, the table was not touched.')
      return
    }

    writeFileSync(TARGET, `${JSON.stringify(catalog, null, 2)}\n`)
    console.log(`\npublic/catalog.json updated (${catalog.tracks.length} tracks).`)
    if (push) await pushToSupabase(catalog)
    return
  }

  console.log(`Fetching ${BEATPORT_GENRES.length} genres…`)
  const result = await refreshCatalog(fetchPage, previous)
  console.log(formatReports(result))

  if (!result.ok || !result.catalog) {
    console.error(
      '\nValidation failed, public/catalog.json was left alone. Look at the reasons above;\n' +
        'if the page structure changed, the fix belongs in the strategies in src/lib/beatport.ts.',
    )
    process.exit(1)
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
  console.error(`Refresh crashed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
