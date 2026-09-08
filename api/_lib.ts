import { timingSafeEqual } from 'node:crypto'
import { get, put } from '@vercel/blob'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const STATE_PATH = 'camelot-setlist/state.json'
export const CATALOG_PATH = 'camelot-setlist/catalog.json'

export function applyCors(request: VercelRequest, response: VercelResponse): boolean {
  response.setHeader('access-control-allow-origin', request.headers.origin ?? '*')
  response.setHeader('access-control-allow-methods', 'GET,PUT,POST,OPTIONS')
  response.setHeader('access-control-allow-headers', 'content-type,x-app-secret,authorization')
  response.setHeader('cache-control', 'no-store')
  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return true
  }
  return false
}

// Sabit süreli karşılaştırma: uzunluk farkı da sızıntı olmasın diye önce eşitlenir.
function sameSecret(given: string, expected: string): boolean {
  const left = Buffer.from(given)
  const right = Buffer.from(expected)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function headerValue(request: VercelRequest, name: string): string {
  const value = request.headers[name]
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

export function isAuthorized(request: VercelRequest): boolean {
  const expected = process.env.APP_SECRET ?? ''
  if (!expected) return true
  return sameSecret(headerValue(request, 'x-app-secret'), expected)
}

export function isCronRequest(request: VercelRequest): boolean {
  const expected = process.env.CRON_SECRET ?? ''
  if (!expected) return false
  const given = headerValue(request, 'authorization').replace(/^Bearer\s+/i, '')
  return sameSecret(given, expected)
}

export function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

export async function readJson<T>(pathname: string): Promise<T | null> {
  if (!hasBlobToken()) return null
  try {
    const result = await get(pathname, { access: 'private', useCache: false })
    if (!result || result.statusCode !== 200) return null
    const text = await new Response(result.stream).text()
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export async function writeJson(pathname: string, value: unknown): Promise<boolean> {
  if (!hasBlobToken()) return false
  await put(pathname, JSON.stringify(value), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  })
  return true
}

export function sendJson(response: VercelResponse, status: number, body: unknown): void {
  response.status(status).json(body)
}

export function sendError(response: VercelResponse, status: number, message: string): void {
  sendJson(response, status, { error: message })
}

export const NO_BLOB_MESSAGE =
  'Blob deposu bağlı değil. Vercel projesinde bir Blob store oluştur ve BLOB_READ_WRITE_TOKEN değişkenini ekle; o zamana kadar kayıtlar yalnızca tarayıcıda tutulur.'
