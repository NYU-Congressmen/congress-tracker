import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('authorizes the inline theme script in the Hosting policy', () => {
  const config = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'))
  const html = readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8')
  const policy = config.hosting.headers.flatMap(({ headers }) => headers)
    .find(({ key }) => key === 'Content-Security-Policy')
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]

  assert(script, 'Expected the inline theme script in frontend/index.html.')
  const hash = createHash('sha256').update(script).digest('base64')
  const scriptSources = policy.value.split(';').map((directive) => directive.trim())
    .find((directive) => directive.startsWith('script-src ')).split(/\s+/)
  assert(scriptSources.includes(`'sha256-${hash}'`), 'Update the theme script hash in firebase.json.')
})

test('routes REST, MCP and share links to one pinned Cloud Run revision before the frontend fallback', () => {
  const config = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'))
  const [backend, fallback] = config.hosting.rewrites
  const paths = new RegExp(backend.regex)
  for (const path of ['/api', '/api/health', '/api/bills/119/hr/1', '/mcp', '/s/k3Xa9QpL']) {
    assert(paths.test(path), `Expected ${path} to reach Cloud Run.`)
  }
  for (const path of ['/', '/bills/119/hr/1', '/mcp-other', '/s', '/social', '/s/k3Xa9QpL/extra']) {
    assert(!paths.test(path), `Expected ${path} to reach the frontend fallback.`)
  }
  assert.equal(backend.run.serviceId, 'pull-api')
  assert.equal(backend.run.pinTag, true)
  assert.equal(fallback.destination, '/index.html')
})

test('allows portraits from the official congressional image paths', () => {
  const config = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'))
  const policy = config.hosting.headers.flatMap(({ headers }) => headers)
    .find(({ key }) => key === 'Content-Security-Policy')
  const imageSources = policy.value.split(';').map((directive) => directive.trim())
    .find((directive) => directive.startsWith('img-src ')).split(/\s+/)
  assert.deepEqual(imageSources.slice(1), [
    "'self'", 'https://www.congress.gov/img/member/', 'https://bioguide.congress.gov/photo/',
  ])
})
