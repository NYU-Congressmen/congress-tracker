import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

// Create a private configuration file without replacing existing contents and return whether it is new.
export function ensureEnvFile(envFile, templateFile) {
  let created = false
  try {
    writeFileSync(envFile, readFileSync(templateFile), { flag: 'wx', mode: 0o600 })
    created = true
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  if (process.platform !== 'win32') chmodSync(envFile, 0o600)
  return created
}

// Return whether the configuration contains a nonempty Congress.gov key.
export function hasApiKey(text) {
  return Boolean(parseEnv(text).CONGRESS_API_KEY?.trim())
}

// Return the key validation result after waiting at most ten seconds for Congress.gov.
export async function checkKey(key) {
  try {
    const response = await fetch('https://api.congress.gov/v3/bill?limit=1&format=json', {
      headers: { 'X-Api-Key': key },
      signal: AbortSignal.timeout(10_000),
    })
    await response.body?.cancel()
    if (response.ok) return 'ok'
    return response.status === 401 || response.status === 403 ? 'rejected' : 'unknown'
  } catch {
    return 'unknown'
  }
}
