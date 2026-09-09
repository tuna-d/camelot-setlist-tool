import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BEATPORT_GENRES } from '../src/lib/beatport'
import { formatReports, refreshCatalog } from '../src/lib/catalog'
import type { Catalog } from '../src/lib/types'

const TARGET = resolve(process.cwd(), 'public/catalog.json')

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

async function readExisting(): Promise<Catalog | null> {
  try {
    const { readFileSync } = await import('node:fs')
    const parsed: unknown = JSON.parse(readFileSync(TARGET, 'utf8'))
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Catalog).tracks)) {
      return parsed as Catalog
    }
    return null
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry')
  const previous = await readExisting()

  console.log(`${BEATPORT_GENRES.length} tür çekiliyor…`)
  const result = await refreshCatalog(fetchPage, previous)
  console.log(formatReports(result))

  if (!result.ok) {
    console.error(
      '\nDoğrulama geçmedi, public/catalog.json değiştirilmedi. Yukarıdaki sebeplere bak;\n' +
        'sayfa yapısı değişmişse düzeltme src/lib/beatport.ts içindeki çıkarım stratejilerinde.',
    )
    process.exit(1)
  }

  if (dry) {
    console.log('\n--dry verildi: dosya yazılmadı.')
    return
  }

  writeFileSync(TARGET, `${JSON.stringify(result.catalog, null, 2)}\n`)
  console.log(`\npublic/catalog.json güncellendi (${result.catalog?.tracks.length ?? 0} parça).`)
}

main().catch((error: unknown) => {
  console.error(`Tazeleme çöktü: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
