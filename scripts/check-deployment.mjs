import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

const [baseUrl, ...flags] = process.argv.slice(2)
const apiOnly = flags.includes('--api-only')
const tokenStdin = flags.includes('--token-stdin')
assert(baseUrl && flags.every((flag) => ['--api-only', '--token-stdin', '--mcp'].includes(flag))
  && (!tokenStdin || apiOnly),
  'Usage: node scripts/check-deployment.mjs URL [--api-only [--token-stdin]] [--mcp]')
const target = new URL(baseUrl)
const headers = {}
if (tokenStdin) {
  assert.equal(target.protocol, 'https:', 'The private API check requires HTTPS.')
  const token = readFileSync(0, 'utf8').trim()
  assert(token, 'Provide an identity token on stdin.')
  headers.Authorization = `Bearer ${token}`
}

// Fetch a public deployment path and return its response.
async function request(path, options = {}) {
  const response = await fetch(new URL(path, target), {
    ...options,
    headers: { ...headers, ...options.headers },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  })
  assert(response.ok, `${path} returned HTTP ${response.status}`)
  return response
}

// Check that a remote MCP client can initialize and discover the read-only tools.
async function checkMcp() {
  const protocolVersion = '2025-06-18'
  async function rpc(method, params, version) {
    const response = await request('/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': version,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    })
    const { result } = await response.json()
    assert(result, `MCP ${method} returned no result.`)
    return result
  }
  const initialized = await rpc('initialize', {
    protocolVersion, capabilities: {}, clientInfo: { name: 'pull-deployment-check', version: '1' },
  }, protocolVersion)
  assert.equal(initialized.serverInfo.name, 'Pull')
  const { tools } = await rpc('tools/list', {}, initialized.protocolVersion)
  for (const name of ['search_bills', 'list_members', 'get_bill_explanation']) {
    assert.equal(tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint, true)
  }
}

// Verify that the API is running and can load a topic and its first feed page.
async function checkApi() {
  const health = await (await request('/api/health')).json()
  assert.equal(health.status, 'ok')
  assert.equal(health.database_configured, true)
  // A missing OpenAI key turns off one feature, so the release reports it without failing.
  for (const [flag, feature] of [['custom_topics_configured', 'Custom topics'], ['summaries_configured', 'Comparison summaries']]) {
    if (health[flag] === false) console.warn(`${feature} are unavailable because the API has no key for them.`)
  }

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
    if (!apiOnly) await checkFrontend()
    await checkApi()
    if (flags.includes('--mcp')) await checkMcp()
    console.log(`Deployment check passed for ${target.origin}`)
    break
  } catch (error) {
    if (attempt === 5) throw error
    console.log(`Check ${attempt} failed. Retrying in 5 seconds.`)
    await delay(5_000)
  }
}
