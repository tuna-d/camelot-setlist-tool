import type { AppState } from './types'

export function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    Array.isArray(record.setlists) &&
    Array.isArray(record.library) &&
    typeof record.savedAt === 'number'
  )
}
