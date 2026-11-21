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
