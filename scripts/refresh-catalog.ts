import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { BEATPORT_GENRES } from '../src/lib/beatport'
import { CATALOG_ID, formatReports, isCatalog, refreshCatalog } from '../src/lib/catalog'
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

async function pushToSupabase(catalog: Catalog): Promise<void> {
  const url = readEnv('SUPABASE_URL')
  const key = readEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !key) {
    console.error(
      '\nSUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY bulunamadı. İkisini .env dosyasına yaz\n' +
        '(değerler Supabase → Project Settings → API sayfasında) ya da komuttan önce ortama ver.',
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
      `\nKatalog tabloya yazılamadı: ${error.message}\n` +
        'Anahtarın service_role olduğunu ve supabase/schema.sql dosyasının çalıştırıldığını doğrula.',
    )
    process.exit(1)
  }

  console.log(`Supabase catalog tablosu güncellendi (${catalog.tracks.length} parça).`)
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry')
  const push = process.argv.includes('--supabase')
  const fromFile = process.argv.includes('--from-file')

  if (fromFile) {
    if (!push) {
      console.error('--from-file yalnızca --supabase ile anlamlı: mevcut dosyayı tabloya yükler.')
      process.exit(1)
    }
    const existing = readExisting()
    if (!existing) {
      console.error(
        'public/catalog.json okunamadı ya da geçerli bir katalog değil.\n' +
          'Önce --from-file olmadan çalıştırıp dosyayı üret.',
      )
      process.exit(1)
    }
    console.log(`public/catalog.json yükleniyor (${existing.tracks.length} parça)…`)
    await pushToSupabase(existing)
    return
  }

  const previous = readExisting()

  console.log(`${BEATPORT_GENRES.length} tür çekiliyor…`)
  const result = await refreshCatalog(fetchPage, previous)
  console.log(formatReports(result))

  if (!result.ok || !result.catalog) {
    console.error(
      '\nDoğrulama geçmedi, public/catalog.json değiştirilmedi. Yukarıdaki sebeplere bak;\n' +
        'sayfa yapısı değişmişse düzeltme src/lib/beatport.ts içindeki çıkarım stratejilerinde.',
    )
    process.exit(1)
  }

  if (dry) {
    console.log('\n--dry verildi: dosya yazılmadı, tabloya da dokunulmadı.')
    return
  }

  writeFileSync(TARGET, `${JSON.stringify(result.catalog, null, 2)}\n`)
  console.log(`\npublic/catalog.json güncellendi (${result.catalog.tracks.length} parça).`)

  if (push) await pushToSupabase(result.catalog)
}

main().catch((error: unknown) => {
  console.error(`Tazeleme çöktü: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
