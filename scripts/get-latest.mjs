// Bring the team's latest code from develop into your dev branch. Run it with
// `git get-latest`, or `npm run get-latest`, at the start of every session. It saves any uncommitted work as a
// commit on your branch, merges develop, updates dependencies and pushes your branch.
// After resolving a conflict, run it again to finish, or add --abort to cancel the merge.
// Only Node's built-in modules are used, so it works even when node_modules is out of date.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'

const isWindows = platform() === 'win32'
const teammates = ['adam', 'akbar', 'abdrahman']
const sharedBranches = ['main', 'develop']
const command = 'git get-latest'
const alias = '!npm run --silent get-latest --'
const saveMessage = 'Save work in progress before getting the latest code'
const interactive = process.stdin.isTTY && !process.env.CI
const lockFiles = ['package-lock.json', 'backend/uv.lock']
const conflictMarker = /^(<{7}|>{7})( |\r?$)/m

// Signal that the command cannot continue and carry the explanation for the teammate.
class Stop extends Error {}

// Print the heading for the next step.
function step(message) {
  console.log(`\n==> ${message}`)
}

// Run a git command and return its output, stopping with git's message if it fails.
function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Stop(`git ${args.join(' ')} failed:\n${(result.stderr || result.stdout).trim()}`)
  }
  return result.stdout.trim()
}

// Return whether a git command succeeds, discarding its output.
function succeeds(...args) {
  return spawnSync('git', args, { stdio: 'ignore' }).status === 0
}

// Return whether a branch or other ref exists.
function refExists(ref) {
  return succeeds('rev-parse', '--quiet', '--verify', ref)
}

// Make git get-latest run this command in this checkout, for clones made before it existed.
function installAlias() {
  const current = spawnSync('git', ['config', 'alias.get-latest'], { encoding: 'utf8' }).stdout.trim()
  if (current !== alias) {
    git('config', 'alias.get-latest', alias)
    console.log('You can now run this command as git get-latest.')
  }
}

// Return whether an unfinished merge is waiting in this checkout.
function mergeInProgress() {
  return refExists('MERGE_HEAD')
}

// Return the lines of a command's output as an array, ignoring empty output.
function lines(text) {
  return text ? text.split('\n') : []
}

// Run a command with its output shown and return whether it succeeded.
function run(program, args) {
  return spawnSync(program, args, { stdio: 'inherit', shell: isWindows && program === 'npm' }).status === 0
}

// Return the uv command, which the official installer may have put outside PATH.
function findUv() {
  const installed = join(homedir(), '.local', 'bin', isWindows ? 'uv.exe' : 'uv')
  for (const candidate of ['uv', installed]) {
    if (spawnSync(candidate, ['--version'], { stdio: 'ignore' }).status === 0) return candidate
  }
  return null
}

// Run npm with the given arguments and return whether it succeeded.
function npm(args) {
  // npm_execpath points at the npm that launched this script, which avoids Windows .cmd issues
  const execPath = process.env.npm_execpath
  return execPath ? run(process.execPath, [execPath, ...args]) : run('npm', args)
}

// Commit lock files that installing dependencies rewrote, so the branch stays consistent.
function commitLockUpdates() {
  const changed = lines(git('status', '--porcelain', '--', ...lockFiles)).map((line) => line.slice(3))
  if (changed.length === 0) return
  git('add', '--', ...changed)
  git('commit', '--quiet', '-m', 'Update the lock files after merging develop')
  console.log(`Committed the updated ${changed.join(' and ')}.`)
}

// Regenerate a lock file and return whether it worked, or return null for any other file.
function regenerateLock(path) {
  if (path === 'package-lock.json') return npm(['install', '--package-lock-only'])
  if (path === 'backend/uv.lock') {
    const uv = findUv()
    return uv !== null && run(uv, ['lock', '--directory', 'backend'])
  }
  return null
}

// Return whether a file in the working tree still holds conflict markers.
function hasMarkers(path) {
  return existsSync(path) && statSync(path).isFile() && conflictMarker.test(readFileSync(path, 'latin1'))
}

// Return the instructions for resolving the listed conflicted files.
function conflictHelp(paths) {
  return [
    'Your branch and the incoming code changed the same lines in these files:',
    ...paths.map((path) => `  ${path}`),
    '',
    'Open each file and find the blocks between <<<<<<< and >>>>>>>. The part above',
    '======= is what your branch had and the part below is what came in. Edit each',
    'block into the code that should stay, delete the marker lines and save. Then run',
    `  ${command}`,
    'again to finish. To cancel the merge instead, run',
    `  ${command} --abort`,
    'Your own work is saved on your branch either way.',
  ].join('\n')
}

// Commit the merge in progress once no conflict markers remain, regenerating lock files.
function finishMerge() {
  const conflicted = lines(git('diff', '--name-only', '--diff-filter=U'))
  const locks = conflicted.filter((path) => lockFiles.includes(path))
  const unresolved = conflicted.filter((path) => !locks.includes(path) && hasMarkers(path))
  // A file staged with git add can still hold markers if the teammate missed a block
  const staged = lines(git('diff', '--cached', '--name-only'))
  unresolved.push(...staged.filter((path) => !conflicted.includes(path) && hasMarkers(path)))
  if (unresolved.length > 0) {
    throw new Stop(conflictHelp(unresolved))
  }
  for (const path of conflicted) {
    if (!locks.includes(path)) git('add', '--all', '--', path)
  }
  // Lock files wait until everything else is resolved, because they follow package.json
  // and backend/pyproject.toml
  for (const path of locks) {
    git('checkout', '--theirs', '--', path)
    if (!regenerateLock(path)) {
      throw new Stop(`Could not regenerate ${path}. Fix the error above and run ${command} again.`)
    }
    git('add', '--', path)
    console.log(`Regenerated ${path} instead of merging it by hand.`)
  }
  git('commit', '--no-edit')
  console.log('Merge finished.')
}

// Merge a ref into the current branch and return how many new commits it brought.
function merge(ref) {
  if (succeeds('merge-base', '--is-ancestor', ref, 'HEAD')) return 0
  const incoming = Number(git('rev-list', '--count', `HEAD..${ref}`))
  const result = spawnSync('git', ['merge', '--no-edit', ref], { encoding: 'utf8' })
  if (result.status !== 0) {
    if (!mergeInProgress()) {
      throw new Stop(`Could not merge ${ref}:\n${(result.stderr || result.stdout).trim()}`)
    }
    finishMerge()
  }
  return incoming
}

// Commit every uncommitted change on the current branch and return whether there were any.
function saveWork(branch) {
  if (!git('status', '--porcelain')) return false
  step('Saving your uncommitted work')
  git('add', '--all')
  const files = lines(git('diff', '--cached', '--name-only'))
  git('commit', '--quiet', '-m', saveMessage)
  console.log(`Saved ${files.length} changed file(s) in a commit on ${branch}:`)
  for (const path of files.slice(0, 10)) console.log(`  ${path}`)
  if (files.length > 10) console.log(`  and ${files.length - 10} more`)
  return true
}

// Return the teammate's name, taken from their only local dev branch or asked for.
async function chooseTeammate() {
  const local = lines(git('for-each-ref', '--format=%(refname:short)', 'refs/heads/dev/'))
  if (local.length === 1) return local[0].slice('dev/'.length)
  if (!interactive) {
    throw new Stop(`Switch to your branch with git switch dev/your-name, then run ${command}.`)
  }
  const choices = teammates.map((name, i) => `${i + 1}) ${name}`).join('  ')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question(`Which teammate are you? ${choices}  `)).trim().toLowerCase()
  rl.close()
  const name = teammates[Number(answer) - 1] ?? (teammates.includes(answer) ? answer : null)
  if (!name) throw new Stop('No teammate chosen, so nothing was changed.')
  return name
}

// Return the dev branch to update, first moving work made on a shared branch onto it.
async function reachDevBranch(branch) {
  if (branch.startsWith('dev/')) return branch
  if (!sharedBranches.includes(branch)) {
    throw new Stop(
      `You are on ${branch || 'no branch'}, and this command updates dev branches only.\n` +
        `Switch with git switch dev/your-name, then run ${command}.`,
    )
  }
  const target = `dev/${await chooseTeammate()}`
  step(`Moving your work from ${branch} to ${target}`)
  // main and develop change only through pull requests, so work done there moves to the
  // teammate's branch, and the shared branch is reset to GitHub's copy once it is safe
  saveWork(branch)
  git('switch', '--quiet', target)
  const moved = merge(branch)
  const carried = moved ? `, with ${moved} commit(s) from ${branch}` : ''
  console.log(`You are now on ${target}${carried}.`)
  return target
}

// Reset local main and develop to GitHub's copies when all their commits are on this branch.
function tidySharedBranches() {
  for (const name of sharedBranches) {
    const local = `refs/heads/${name}`
    const remote = `refs/remotes/origin/${name}`
    if (!refExists(local) || !refExists(remote)) continue
    if (git('rev-parse', local) === git('rev-parse', remote)) continue
    if (succeeds('merge-base', '--is-ancestor', local, 'HEAD')) {
      git('branch', '--force', name, `origin/${name}`)
    }
  }
}

// Install the frontend and backend dependencies the merged lock files ask for.
function updateDependencies() {
  if (existsSync('package.json')) {
    step('Updating frontend packages')
    if (!npm(['install'])) throw new Stop(`npm install failed. Fix the error above and run ${command} again.`)
  }
  const uv = findUv()
  if (existsSync('backend/uv.lock') && uv) {
    step('Updating backend packages')
    if (!run(uv, ['sync', '--directory', 'backend'])) {
      throw new Stop(`uv sync failed. Fix the error above and run ${command} again.`)
    }
  }
  commitLockUpdates()
}

// Push the branch to GitHub so the work is backed up.
function push(branch) {
  step('Backing up your branch on GitHub')
  const result = spawnSync('git', ['push', '--quiet', '--set-upstream', 'origin', branch], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Stop(
      'Your branch is up to date on this computer, but pushing it failed:\n' +
        `${(result.stderr || result.stdout).trim()}\nRun ${command} again once that is fixed.`,
    )
  }
  console.log(`Pushed ${branch}.`)
}

// Cancel the merge in progress, leaving the branch as it was before the merge began.
function abort() {
  if (!mergeInProgress()) {
    console.log('There is no merge to cancel.')
    return
  }
  git('merge', '--abort')
  console.log('Cancelled the merge. Any uncommitted work was saved in a commit before it began.')
}

// Update the current dev branch with develop and push it.
async function getLatest(args) {
  process.chdir(git('rev-parse', '--show-toplevel'))
  installAlias()
  if (args.includes('--abort')) {
    abort()
    return
  }
  if (mergeInProgress()) {
    step('Finishing the merge')
    finishMerge()
  }
  step('Fetching the latest code from GitHub')
  git('fetch', '--quiet', '--prune', 'origin')
  const branch = await reachDevBranch(git('branch', '--show-current'))
  saveWork(branch)
  // Work pushed from another computer comes first, so the push at the end is never rejected
  if (refExists(`refs/remotes/origin/${branch}`)) merge(`origin/${branch}`)
  step('Merging develop')
  const incoming = merge('origin/develop')
  console.log(incoming ? `Merged ${incoming} new commit(s).` : 'Your branch has everything on develop.')
  tidySharedBranches()
  updateDependencies()
  push(branch)
  step(`${branch} is up to date with develop`)
}

try {
  await getLatest(process.argv.slice(2))
} catch (error) {
  if (!(error instanceof Stop)) throw error
  console.error(`\n${error.message}`)
  process.exit(1)
}
