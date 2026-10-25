import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const installer = join(import.meta.dirname, 'install-hooks.mjs')

test('installs hooks in a checkout and fails when its configuration cannot be written', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'congress-hooks-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const options = { cwd: directory, encoding: 'utf8' }
  assert.equal(spawnSync('git', ['init', '--quiet'], options).status, 0)
  assert.equal(spawnSync(process.execPath, [installer], options).status, 0)
  assert.equal(spawnSync('git', ['config', '--local', 'core.hooksPath'], options).stdout.trim(), '.githooks')

  writeFileSync(join(directory, '.git', 'config.lock'), '')
  const result = spawnSync(process.execPath, [installer], options)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Could not install the git hooks/)
})

test('skips hook installation outside a checkout', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'congress-archive-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  assert.equal(spawnSync(process.execPath, [installer], { cwd: directory }).status, 0)
})
