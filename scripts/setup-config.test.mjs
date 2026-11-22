import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkKey, ensureEnvFile, hasApiKey } from './setup-config.mjs'

test('creates private configuration and preserves existing contents on rerun', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'congress-setup-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const template = join(directory, 'template.txt')
  const destination = join(directory, 'config.txt')
  writeFileSync(template, 'CONGRESS_API_KEY=\n')

  assert.equal(ensureEnvFile(destination, template), true)
  assert.equal(readFileSync(destination, 'utf8'), 'CONGRESS_API_KEY=\n')
  if (process.platform !== 'win32') assert.equal(statSync(destination).mode & 0o777, 0o600)

  const existing = 'CONGRESS_API_KEY=synthetic-key\nOTHER=value\n'
  writeFileSync(destination, existing)
  if (process.platform !== 'win32') chmodSync(destination, 0o644)
  assert.equal(ensureEnvFile(destination, template), false)
  assert.equal(readFileSync(destination, 'utf8'), existing)
  if (process.platform !== 'win32') assert.equal(statSync(destination).mode & 0o777, 0o600)
})

test('recognizes empty keys using dotenv syntax', () => {
  for (const value of ['', '""', "''", '"   "', ' # no key yet']) {
    assert.equal(hasApiKey(`CONGRESS_API_KEY=${value}\n`), false)
  }
  assert.equal(hasApiKey('OTHER=value\n'), false)
  assert.equal(hasApiKey('export CONGRESS_API_KEY = "synthetic-key" # comment\n'), true)
})

test('classifies API responses and sends the key only in a header', async (t) => {
  for (const [status, expected] of [[200, 'ok'], [401, 'rejected'], [403, 'rejected'], [429, 'unknown'], [500, 'unknown']]) {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url.includes('synthetic-key'), false)
      assert.equal(options.headers['X-Api-Key'], 'synthetic-key')
      assert.ok(options.signal instanceof AbortSignal)
      return new Response(null, { status })
    })
    assert.equal(await checkKey('synthetic-key'), expected)
    t.mock.restoreAll()
  }
})

test('returns unknown when the ten-second request deadline expires', async (t) => {
  const controller = new AbortController()
  t.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    assert.equal(milliseconds, 10_000)
    return controller.signal
  })
  t.mock.method(globalThis, 'fetch', (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))

  const result = checkKey('synthetic-key')
  controller.abort(new DOMException('Request timed out', 'TimeoutError'))
  assert.equal(await result, 'unknown')
})
