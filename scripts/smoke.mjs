/*
 * Uçtan uca duman testi.
 *
 * Playwright bilerek bağımlılık listesinde değil: kurulumu ~150 MB tarayıcı
 * indirmesi ekliyor. Çalıştırmadan önce bir kez:
 *
 *   npm install --no-save playwright
 *   npx playwright install chromium
 *
 * Sonra:
 *
 *   npm run build && node scripts/smoke.mjs
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const ROOT = resolve(process.cwd())
const DIST = join(ROOT, 'dist')
const FIXTURE = join(ROOT, 'test/fixtures/sample-collection.xml')
const PORT = 4319

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

const server_state = { saved: null, puts: 0, searches: 0 }

function readBody(request) {
  return new Promise((done) => {
    let raw = ''
    request.on('data', (chunk) => {
      raw += chunk
    })
    request.on('end', () => done(raw))
  })
}

function startServer() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://localhost:${PORT}`)

    if (url.pathname === '/api/state') {
      if (request.method === 'PUT') {
        server_state.saved = JSON.parse(await readBody(request))
        server_state.puts += 1
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ ok: true }))
        return
      }
      response.writeHead(server_state.saved ? 200 : 404, { 'content-type': 'application/json' })
      response.end(JSON.stringify(server_state.saved ?? { error: 'kayıt yok' }))
      return
    }

    if (url.pathname === '/api/track-search') {
      server_state.searches += 1
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          configured: true,
          results: [{ title: 'Uzak Parça', artist: 'Sahte Servis', bpm: 126, key: 'G Minor' }],
        }),
      )
      return
    }

    if (url.pathname === '/api/catalog') {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'katalog yok' }))
      return
    }

    const filePath = join(DIST, url.pathname === '/' ? 'index.html' : url.pathname)
    const target = existsSync(filePath) ? filePath : join(DIST, 'index.html')
    const body = await readFile(target)
    response.writeHead(200, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream' })
    response.end(body)
  })

  return new Promise((done) => server.listen(PORT, () => done(server)))
}

let stepIndex = 0
function ok(label) {
  stepIndex += 1
  console.log(`  ✓ ${String(stepIndex).padStart(2, ' ')}. ${label}`)
}

function fail(label, detail) {
  console.error(`  ✗ ${label}\n    ${detail}`)
  process.exitCode = 1
  throw new Error(label)
}

async function expectVisible(page, locator, label) {
  try {
    await locator.first().waitFor({ state: 'visible', timeout: 8000 })
  } catch {
    fail(label, 'ekranda görünmedi')
  }
  ok(label)
}

async function main() {
  if (!existsSync(DIST)) {
    console.error('dist/ yok. Önce `npm run build` çalıştır.')
    process.exit(1)
  }

  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    console.error(
      'Playwright kurulu değil. Bu test bilerek bağımlılık listesinde değil:\n' +
        '  npm install --no-save playwright\n' +
        '  npx playwright install chromium',
    )
    process.exit(1)
  }

  const server = await startServer()
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const consoleErrors = []
  page.on('console', (message) => {
    // /api/state ve /api/catalog yokken 404 dönmesi tasarımın parçası: istemci
    // yerel kayda ve public/catalog.json'a düşüyor. Kaynak yükleme gürültüsü sayılmaz.
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  console.log('duman testi başlıyor…')

  try {
    await page.goto(`http://localhost:${PORT}/`)
    await expectVisible(page, page.getByRole('heading', { name: 'Camelot Setlist' }), 'uygulama açılıyor')

    // 1 — rekordbox XML içe aktarma
    await page.getByRole('button', { name: 'rekordbox XML' }).click()
    await page.locator('dialog[open] input[type="file"]').setInputFiles(FIXTURE)
    await expectVisible(page, page.getByText('İçe aktarıldı'), 'XML içe aktarıldı')
    await page.getByRole('button', { name: 'tamam' }).click()

    if (!(await page.getByText('5 parça').first().isVisible())) {
      fail('kütüphane özeti', '5 parça görünmedi')
    }
    ok('kütüphane üst çubukta görünüyor')

    // 2 — playlist seçimi
    await page.locator('select.topbar-select').selectOption({ label: 'Kulüp / Açılış (2)' })
    await page.waitForTimeout(150)
    ok('playlist seçildi')

    await page.locator('select.topbar-select').selectOption('')
    await page.waitForTimeout(150)

    // 3 — yerel arama (Türkçe karakter yazmadan)
    await page.getByRole('button', { name: 'parça ara' }).click()
    await page.locator('dialog[open] input.input').first().fill('gece yuruyusu')
    await expectVisible(page, page.getByText('Gece Yürüyüşü'), 'yerel arama Türkçe karakteri katlıyor')

    // 4 — internet araması
    await page.getByRole('button', { name: 'internette ara' }).click()
    await expectVisible(page, page.getByText('Uzak Parça'), 'internet araması sonuç veriyor')
    if (server_state.searches === 0) fail('internet araması', 'sunucuya istek gitmedi')

    // Yerel sonucu sete ekle: başlangıç parçası bu olacak.
    await page.locator('dialog[open] .entry', { hasText: 'Gece Yürüyüşü' }).getByRole('button', { name: 'ekle' }).click()
    await expectVisible(page, page.locator('.entries .entry').first(), 'parça setliste eklendi')

    // 5 — öneri ekleme (kütüphane havuzundan)
    await page.getByRole('button', { name: 'Kütüphanem' }).click()
    const suggestion = page.locator('section[aria-label="Öneriler"] .entry').first()
    await expectVisible(page, suggestion, 'öneriler listeleniyor')
    await suggestion.getByRole('button', { name: 'ekle' }).click()
    if ((await page.locator('.entries > li').count()) !== 2) fail('öneri ekleme', 'ikinci parça eklenmedi')
    ok('öneri setliste eklendi')

    await expectVisible(page, page.locator('.bridge').first(), 'geçiş köprüsü çiziliyor')

    // 6 — otomatik set kurma
    await page.getByRole('button', { name: 'otomatik kur' }).click()
    await expectVisible(page, page.getByText('önizleme'), 'otomatik kurucu önizleme veriyor')
    await page.getByRole('button', { name: 'sete ekle' }).click()
    const afterAuto = await page.locator('.entries > li').count()
    if (afterAuto <= 2) fail('otomatik kurma', `set büyümedi (${afterAuto} parça)`)
    ok(`otomatik kurma ${afterAuto} parçalık set bıraktı`)

    // 7 — çoklu setlist
    await page.getByRole('button', { name: 'setlerim' }).click()
    await page.locator('.menu-panel').getByRole('button', { name: '+ yeni set' }).click()
    if ((await page.locator('.entries > li').count()) !== 0) fail('çoklu setlist', 'yeni set boş değil')
    ok('yeni setlist boş açılıyor')
    await page.getByRole('button', { name: 'setlerim' }).click()
    await page.locator('.menu-panel').getByRole('button', { name: 'Set 1 ·' }).click()
    if ((await page.locator('.entries > li').count()) !== afterAuto) {
      fail('çoklu setlist', 'ilk setin içeriği değişti')
    }
    ok('setlistler birbirinden bağımsız')

    // 8 — not yazma
    await page.locator('textarea.textarea').fill('cuma gecesi kapanış')
    await page.locator('.entry-note').first().fill('ışıklar kısılsın')
    ok('set ve parça notu yazıldı')

    // 9 — misafir kipi: sunucuya yazılmıyor, tarayıcıda duruyor
    await page.waitForTimeout(3500)
    if (server_state.puts > 0) fail('misafir kipi', 'giriş yokken sunucuya kayıt gitti')
    const stored = await page.evaluate(() => localStorage.getItem('camelot-setlist:v1'))
    if (!stored) fail('misafir kipi', 'tarayıcıya kayıt yazılmadı')
    const parsed = JSON.parse(stored)
    if (parsed.library.length !== 5) {
      fail("misafir kipi", `tam koleksiyon yazılmadı (${parsed.library.length} parça)`)
    }
    ok(`misafir çalışması yalnızca tarayıcıda (${parsed.library.length} parçalık koleksiyon)`)

    if (!(await page.getByText('yalnızca bu tarayıcıda').first().isVisible())) {
      fail('misafir uyarısı', 'banner görünmedi')
    }
    ok('kayıt uyarısı görünüyor')

    // 10 — yenileme sonrası kalıcılık
    await page.reload()
    await expectVisible(page, page.getByText('cuma gecesi kapanış'), 'set notu yenilemeden sonra duruyor')
    if ((await page.locator('.entries > li').count()) !== afterAuto) {
      fail('kalıcılık', 'yenilemeden sonra setlist değişti')
    }
    ok('setlist yenilemeden sonra aynı')

    // 11 — mobilde yatay kaydırma yok
    await page.setViewportSize({ width: 375, height: 812 })
    await page.waitForTimeout(200)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    if (overflow > 0) fail('mobil düzen', `yatay taşma ${overflow}px`)
    ok('mobilde yatay kaydırma yok')

    if (consoleErrors.length > 0) {
      fail('konsol', `hata var:\n    ${consoleErrors.join('\n    ')}`)
    }
    ok('konsolda hata yok')

    console.log('\nduman testi geçti.')
  } finally {
    await browser.close()
    server.close()
  }
}

main().catch((error) => {
  console.error(`\nduman testi düştü: ${error.message}`)
  process.exit(1)
})
