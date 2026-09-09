import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

/** The catalog table holds a single row; its id is fixed (mirrors src/lib/catalog.ts). */
export const CATALOG_ID = 'current'

export function applyCors(request: VercelRequest, response: VercelResponse): boolean {
  response.setHeader('access-control-allow-origin', request.headers.origin ?? '*')
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  response.setHeader('access-control-allow-headers', 'content-type,authorization')
  response.setHeader('cache-control', 'no-store')
  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return true
  }
  return false
}

function headerValue(request: VercelRequest, name: string): string {
  const value = request.headers[name]
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

let service: SupabaseClient | null | undefined

export function getServiceClient(): SupabaseClient | null {
  if (service !== undefined) return service
  const url = process.env.SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  service = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
  return service
}

/** Id of the session owner; `null` when the header is missing or the token is invalid. */
export async function readUserId(request: VercelRequest): Promise<string | null> {
  const client = getServiceClient()
  if (!client) return null
  const token = headerValue(request, 'authorization').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await client.auth.getUser(token)
  return error ? null : (data.user?.id ?? null)
}

export function sendJson(response: VercelResponse, status: number, body: unknown): void {
  response.status(status).json(body)
}

export function sendError(response: VercelResponse, status: number, message: string): void {
  sendJson(response, status, { error: message })
}

export const NO_SUPABASE_MESSAGE =
  'The server side is not connected to Supabase. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to the Vercel environment variables.'
