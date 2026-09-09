/**
 * .env reader. Vite only feeds the browser side; command line scripts read
 * server variables such as SUPABASE_SERVICE_ROLE_KEY from here.
 */
export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, '')
    if (!line || line.startsWith('#')) continue

    const split = line.indexOf('=')
    if (split <= 0) continue

    const key = line.slice(0, split).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue

    let value = line.slice(split + 1).trim()
    const quoted = value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]
    if (quoted) value = value.slice(1, -1)
    else value = value.split(' #')[0].trim()

    values[key] = value
  }

  return values
}
