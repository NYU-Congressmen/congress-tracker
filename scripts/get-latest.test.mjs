import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const script = join(import.meta.dirname, 'get-latest.mjs')
const saveMessage = 'Save work in progress before getting the latest code'

// Isolate the tests from this machine's git configuration and global hooks
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  CI: '1',
}

// Run git in a directory and return its output, failing the test if git fails.
function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

// Run the get-latest script in a checkout and return the completed process.
function getLatest(cwd, ...args) {
  return spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8' })
}

// Write a file in a checkout and commit it.
function commit(cwd, name, text, message) {
  writeFileSync(join(cwd, name), text)
  git(cwd, 'add', name)
  git(cwd, 'commit', '--quiet', '-m', message)
}

// Create a remote with main, develop and dev/adam and return two teammates' clones.
function team(t) {
  const directory = mkdtempSync(join(tmpdir(), 'congress-get-latest-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const remote = join(directory, 'remote.git')
  git(directory, 'init', '--quiet', '--bare', '--initial-branch=main', remote)
  const seed = join(directory, 'seed')
  git(directory, 'clone', '--quiet', remote, seed)
  commit(seed, 'shared.txt', 'first line\n', 'Start the project')
  git(seed, 'push', '--quiet', 'origin', 'main', 'main:develop', 'main:dev/adam')
  const adam = join(directory, 'adam')
  const teammate = join(directory, 'teammate')
  git(directory, 'clone', '--quiet', '--branch=dev/adam', remote, adam)
  git(directory, 'clone', '--quiet', '--branch=develop', remote, teammate)
  return { adam, teammate }
}

test('saves uncommitted work, merges develop and pushes the branch', (t) => {
  const { adam, teammate } = team(t)
  commit(teammate, 'feature.txt', 'from develop\n', "Add a teammate's feature")
  git(teammate, 'push', '--quiet', 'origin', 'develop')
  writeFileSync(join(adam, 'notes.txt'), 'unfinished\n')

  const result = getLatest(adam)

  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(join(adam, 'feature.txt'), 'utf8'), 'from develop\n')
  assert.equal(git(adam, 'status', '--porcelain'), '')
  assert.match(git(adam, 'log', '--format=%s'), new RegExp(saveMessage))
  assert.equal(git(adam, 'rev-parse', 'HEAD'), git(adam, 'rev-parse', 'origin/dev/adam'))
  assert.equal(git(adam, 'config', 'alias.get-latest'), '!npm run --silent get-latest --')
})

test('stops on a conflict until it is resolved and then finishes', (t) => {
  const { adam, teammate } = team(t)
  commit(teammate, 'shared.txt', "develop's line\n", 'Change the line on develop')
  git(teammate, 'push', '--quiet', 'origin', 'develop')
  writeFileSync(join(adam, 'shared.txt'), "adam's line\n")

  const first = getLatest(adam)
  assert.equal(first.status, 1)
  assert.match(first.stderr, /shared\.txt/)
  assert.equal(getLatest(adam).status, 1)

  writeFileSync(join(adam, 'shared.txt'), "adam's line\ndevelop's line\n")
  const finished = getLatest(adam)

  assert.equal(finished.status, 0, finished.stderr)
  git(adam, 'merge-base', '--is-ancestor', 'origin/develop', 'HEAD')
  assert.equal(git(adam, 'rev-parse', 'HEAD'), git(adam, 'rev-parse', 'origin/dev/adam'))
})

test('abort returns the branch to the saved work', (t) => {
  const { adam, teammate } = team(t)
  commit(teammate, 'shared.txt', "develop's line\n", 'Change the line on develop')
  git(teammate, 'push', '--quiet', 'origin', 'develop')
  writeFileSync(join(adam, 'shared.txt'), "adam's line\n")
  assert.equal(getLatest(adam).status, 1)

  const result = getLatest(adam, '--abort')

  assert.equal(result.status, 0, result.stderr)
  assert.equal(git(adam, 'log', '-1', '--format=%s'), saveMessage)
  assert.equal(readFileSync(join(adam, 'shared.txt'), 'utf8'), "adam's line\n")
  assert.equal(git(adam, 'status', '--porcelain'), '')
})

test('moves commits made on develop to the dev branch', (t) => {
  const { adam } = team(t)
  git(adam, 'switch', '--quiet', 'develop')
  commit(adam, 'solo.txt', 'committed on develop\n', 'Work directly on develop')

  const result = getLatest(adam)

  assert.equal(result.status, 0, result.stderr)
  assert.equal(git(adam, 'branch', '--show-current'), 'dev/adam')
  assert.ok(existsSync(join(adam, 'solo.txt')))
  assert.equal(git(adam, 'rev-parse', 'develop'), git(adam, 'rev-parse', 'origin/develop'))
  assert.equal(git(adam, 'rev-parse', 'HEAD'), git(adam, 'rev-parse', 'origin/dev/adam'))
})
