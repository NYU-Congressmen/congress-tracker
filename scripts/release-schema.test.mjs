import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./check-release-schema.sh', import.meta.url))

function runSchemaCheck(t, {
  apiDatabaseVersion = '1',
  jobDatabaseVersion = '1',
  jobExitCode = '0',
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'pull-schema-test-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const callsFile = join(directory, 'calls')

  writeFileSync(join(directory, 'gcloud'), `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$MOCK_CALLS"
case "$2 $3" in
  'services describe') version=$API_DATABASE_VERSION ;;
  'jobs describe') version=$JOB_DATABASE_VERSION ;;
  'jobs execute') exit "$JOB_EXIT_CODE" ;;
  *) exit 2 ;;
esac
printf '{"env":[{"name":"DATABASE_URL","valueFrom":{"secretKeyRef":{"name":"pull-database-url","key":"%s"}}}]}\\n' "$version"
`, { mode: 0o700 })

  const result = spawnSync('bash', [script, '4b30c96e82af'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: directory + delimiter + process.env.PATH,
      MOCK_CALLS: callsFile,
      API_DATABASE_VERSION: apiDatabaseVersion,
      JOB_DATABASE_VERSION: jobDatabaseVersion,
      JOB_EXIT_CODE: jobExitCode,
    },
  })
  return { result, calls: readFileSync(callsFile, 'utf8') }
}

test('waits for the private schema check with the release revision', (t) => {
  const { result, calls } = runSchemaCheck(t)
  assert.equal(result.status, 0, result.stderr)
  assert.match(calls, /jobs execute pull-schema-check.*--args=4b30c96e82af --wait/)
})

test('stops when the schema check fails', (t) => {
  const { result } = runSchemaCheck(t, { jobExitCode: '1' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Supabase readiness check failed/)
})

test('stops if the API and job use different database secret versions', (t) => {
  const { result, calls } = runSchemaCheck(t, { jobDatabaseVersion: '2' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /different database secret versions/)
  assert.doesNotMatch(calls, /jobs execute/)
})

test('stops even when both database secret references say latest', (t) => {
  const { result, calls } = runSchemaCheck(t, {
    apiDatabaseVersion: 'latest',
    jobDatabaseVersion: 'latest',
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /numbered Secret Manager version/)
  assert.doesNotMatch(calls, /jobs execute/)
})
