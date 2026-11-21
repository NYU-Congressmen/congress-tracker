import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

const [baseUrl, mode, auth] = process.argv.slice(2)
assert(baseUrl && (mode === undefined || mode === '--api-only')
  && (auth === undefined || (mode === '--api-only' && auth === '--token-stdin')),
  'Usage: node scripts/check-deployment.mjs URL [--api-only [--token-stdin]]')
const target = new URL(baseUrl)
const headers = {}
if (auth === '--token-stdin') {
  assert.equal(target.protocol, 'https:', 'The private API check requires HTTPS.')
  const token = readFileSync(0, 'utf8').trim()
  assert(token, 'Provide an identity token on stdin.')
  headers.Authorization = `Bearer ${token}`
}

// Fetch a public deployment path and return its response.
async function request(path) {
  const response = await fetch(new URL(path, target), {
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  })
  assert(response.ok, `${path} returned HTTP ${response.status}`)
  return response
}

// Verify that the API is running and can load a topic and its first feed page.
async function checkApi() {
  const health = await (await request('/api/health')).json()
  assert.equal(health.status, 'ok')
  assert.equal(health.database_configured, true)

  const topics = await (await request('/api/issues')).json()
  assert(Number.isInteger(topics[0]?.issue_id), 'The topic list is empty or invalid.')
  const feed = await (await request(`/api/feed?issue_id=${topics[0].issue_id}&limit=1`)).json()
  assert.equal(feed.page, 1)
  assert.equal(feed.limit, 1)
  assert(Number.isInteger(feed.total) && Array.isArray(feed.data), 'The feed response is invalid.')
}

// Verify that the homepage serves the built frontend and its entry script.
async function checkFrontend() {
  const page = await (await request('/')).text()
  const asset = page.match(/<script\b[^>]*\bsrc="(\/assets\/[^"]+\.js)"/)?.[1]
  assert(asset, 'The homepage is missing its built JavaScript.')
  const response = await request(asset)
  assert.match(response.headers.get('content-type') ?? '', /javascript/)
}

for (let attempt = 1; attempt <= 5; attempt += 1) {
  try {
    if (mode !== '--api-only') await checkFrontend()
    await checkApi()
    console.log(`Deployment check passed for ${target.origin}`)
    break
  } catch (error) {
    if (attempt === 5) throw error
    console.log(`Check ${attempt} failed. Retrying in 5 seconds.`)
    await delay(5_000)
  }
}
