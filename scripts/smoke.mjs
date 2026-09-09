/*
 * End-to-end smoke test.
 *
 * Playwright is deliberately not a dependency: installing it pulls a ~150 MB
 * browser download. Run this once before the test:
 *
 *   npm install --no-save playwright
 *   npx playwright install chromium
 *
 * Then:
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
      response.end(JSON.stringify(server_state.saved ?? { error: 'no record' }))
      return
    }

    if (url.pathname === '/api/track-search') {
      server_state.searches += 1
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          configured: true,
          message: null,
          raw: {
            search: [
              { song_title: 'Uzak Parça', artist: { name: 'Sahte Servis' }, tempo: '126', key_of: 'G Minor' },
            ],
          },
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
    fail(label, 'never appeared on screen')
  }
  ok(label)
}

async function main() {
  if (!existsSync(DIST)) {
    console.error('No dist/. Run `npm run build` first.')
    process.exit(1)
  }

  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    console.error(
      'Playwright is not installed. This test deliberately keeps it out of the dependencies:\n' +
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
    // A 404 from /api/state and /api/catalog is by design: the client falls back to the
    // local record and public/catalog.json. Resource load noise does not count.
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  console.log('smoke test starting…')

  try {
    await page.goto(`http://localhost:${PORT}/`)
    await expectVisible(page, page.getByRole('heading', { name: 'Camelot Setlist' }), 'the app opens')

    // 1 — importing the rekordbox XML
    await page.getByRole('button', { name: 'rekordbox XML' }).click()
    await page.locator('dialog[open] input[type="file"]').setInputFiles(FIXTURE)
    await expectVisible(page, page.getByText('Imported'), 'XML imported')
    await page.getByRole('button', { name: 'done' }).click()

    if (!(await page.getByText('5 tracks').first().isVisible())) {
      fail('library summary', '5 tracks never showed')
    }
    ok('library shows in the top bar')

    // 2 — selecting a playlist
    await page.locator('select.topbar-select').selectOption({ label: 'Kulüp / Açılış (2)' })
    await page.waitForTimeout(150)
    ok('playlist selected')

    await page.locator('select.topbar-select').selectOption('')
    await page.waitForTimeout(150)

    // 3 — local search (typed without diacritics)
    await page.getByRole('button', { name: 'find a track' }).click()
    await page.locator('dialog[open] input.input').first().fill('gece yuruyusu')
    await expectVisible(page, page.getByText('Gece Yürüyüşü'), 'local search folds diacritics')

    // 4 — web search
    await page.getByRole('button', { name: 'search the web' }).click()
    await expectVisible(page, page.getByText('Uzak Parça'), 'web search returns a result')
    if (server_state.searches === 0) fail('web search', 'no request reached the server')

    // Add the local result to the set: this becomes the starting track.
    await page.locator('dialog[open] .entry', { hasText: 'Gece Yürüyüşü' }).getByRole('button', { name: 'add' }).click()
    await expectVisible(page, page.locator('.entries .entry').first(), 'track added to the setlist')

    // 5 — adding a suggestion (from the library pool)
    await page.getByRole('button', { name: 'My library' }).click()
    const suggestion = page.locator('section[aria-label="Suggestions"] .entry').first()
    await expectVisible(page, suggestion, 'suggestions are listed')
    await suggestion.getByRole('button', { name: 'add' }).click()
    if ((await page.locator('.entries > li').count()) !== 2) fail('adding a suggestion', 'the second track was not added')
    ok('suggestion added to the setlist')

    await expectVisible(page, page.locator('.bridge').first(), 'the transition bridge is drawn')

    // 6 — automatic set building
    await page.getByRole('button', { name: 'build it for me' }).click()
    await expectVisible(page, page.getByText('preview'), 'the builder shows a preview')
    await page.getByRole('button', { name: 'add to the set' }).click()
    const afterAuto = await page.locator('.entries > li').count()
    if (afterAuto <= 2) fail('automatic build', `the set did not grow (${afterAuto} tracks)`)
    ok(`automatic build left a ${afterAuto} track set`)

    // 7 — multiple setlists
    await page.getByRole('button', { name: 'my sets' }).click()
    await page.locator('.menu-panel').getByRole('button', { name: '+ new set' }).click()
    if ((await page.locator('.entries > li').count()) !== 0) fail('multiple setlists', 'the new set is not empty')
    ok('a new setlist opens empty')
    await page.getByRole('button', { name: 'my sets' }).click()
    await page.locator('.menu-panel').getByRole('button', { name: 'Set 1 ·' }).click()
    if ((await page.locator('.entries > li').count()) !== afterAuto) {
      fail('multiple setlists', 'the first set changed')
    }
    ok('setlists are independent')

    // 8 — writing notes
    await page.locator('textarea.textarea').fill('cuma gecesi kapanış')
    await page.locator('.entry-note').first().fill('ışıklar kısılsın')
    ok('set note and track note written')

    // 9 — guest mode: nothing goes to the server, it stays in the browser
    await page.waitForTimeout(3500)
    if (server_state.puts > 0) fail('guest mode', 'a record reached the server without sign-in')
    const stored = await page.evaluate(() => localStorage.getItem('camelot-setlist:v1'))
    if (!stored) fail('guest mode', 'nothing was written to the browser')
    const parsed = JSON.parse(stored)
    if (parsed.library.length !== 5) {
      fail("guest mode", `the whole collection was not written (${parsed.library.length} tracks)`)
    }
    ok(`guest work stays in the browser (${parsed.library.length} track collection)`)

    if (!(await page.getByText('this browser only').first().isVisible())) {
      fail('guest banner', 'the banner never showed')
    }
    ok('the storage banner is visible')

    // 10 — persistence across a reload
    await page.reload()
    await expectVisible(page, page.getByText('cuma gecesi kapanış'), 'the set note survives a reload')
    if ((await page.locator('.entries > li').count()) !== afterAuto) {
      fail('persistence', 'the setlist changed after a reload')
    }
    ok('the setlist is unchanged after a reload')

    // 11 — no horizontal scrolling on mobile
    await page.setViewportSize({ width: 375, height: 812 })
    await page.waitForTimeout(200)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    if (overflow > 0) fail('mobile layout', `${overflow}px of horizontal overflow`)
    ok('no horizontal scrolling on mobile')

    if (consoleErrors.length > 0) {
      fail('console', `errors:\n    ${consoleErrors.join('\n    ')}`)
    }
    ok('no console errors')

    console.log('\nsmoke test passed.')
  } finally {
    await browser.close()
    server.close()
  }
}

main().catch((error) => {
  console.error(`\nsmoke test failed: ${error.message}`)
  process.exit(1)
})
