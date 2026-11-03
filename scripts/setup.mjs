// Prepare a fresh clone for development. Only Node's built-in modules are used, because
// this runs before npm install has created node_modules.
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { checkKey, ensureEnvFile, hasApiKey } from './setup-config.mjs'

const root = join(import.meta.dirname, '..')
const isWindows = platform() === 'win32'
const teammates = ['adam', 'akbar', 'abdrahman', 'manah']
const interactive = process.stdin.isTTY && !process.env.CI

// Print the next setup step.
function step(message) {
  console.log(`\n==> ${message}`)
}

// Run a command in the repo and throw if it fails.
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`)
  }
}

// Return a command's output or null if it fails.
function output(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}

// Ask a visible question and return the normalized answer.
async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(question)
  rl.close()
  return answer.trim().toLowerCase()
}

// Read a line without echoing it, so a secret never appears on screen or in scrollback.
function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin
    process.stdout.write(question)
    stdin.setRawMode(true)
    stdin.setEncoding('utf8')
    stdin.resume()
    let value = ''
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stdin.off('data', onData)
          stdin.setRawMode(false)
          stdin.pause()
          process.stdout.write('\n')
          resolve(value)
          return
        }
        if (char === '\u0003') {
          process.stdout.write('\n')
          process.exit(130)
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1)
        } else if (char >= ' ') {
          value += char
        }
      }
    }
    stdin.on('data', onData)
  })
}

// Report whether Node matches the project's version.
function checkNode() {
  step('Checking Node')
  const wanted = readFileSync(join(root, '.nvmrc'), 'utf8').trim()
  const major = process.versions.node.split('.')[0]
  if (major === wanted) {
    console.log(`Node ${process.versions.node}`)
  } else {
    console.log(`Node ${process.versions.node} is running, but the project uses Node ${wanted}.`)
    console.log(`Setup will continue, but install Node ${wanted} if anything fails.`)
  }
}

// Return the uv command to use, installing uv first if the teammate agrees.
async function findUv() {
  step('Checking uv')
  // The official installer puts uv here, which may not be on PATH until a new terminal opens
  const installed = join(homedir(), '.local', 'bin', isWindows ? 'uv.exe' : 'uv')
  for (const candidate of ['uv', installed]) {
    const version = output(candidate, ['--version'])
    if (version) {
      console.log(version)
      return candidate
    }
  }

  const script = isWindows
    ? 'irm https://astral.sh/uv/install.ps1 | iex'
    : 'curl -LsSf https://astral.sh/uv/install.sh | sh'
  console.log('uv is not installed. It manages Python and the backend packages.')
  if (!interactive || (await ask('Install it now with the official installer? [Y/n] ')) === 'n') {
    const command = isWindows ? `powershell -ExecutionPolicy ByPass -c "${script}"` : script
    console.log(`Install it yourself with:\n  ${command}\nThen run npm run setup again.`)
    process.exit(1)
  }
  if (isWindows) {
    run('powershell', ['-ExecutionPolicy', 'ByPass', '-c', script])
  } else {
    run('sh', ['-c', script])
  }
  return installed
}

// Install the frontend and backend dependencies.
function installDependencies(uv) {
  step('Installing frontend packages')
  // npm_execpath points at the npm that launched this script, which avoids Windows .cmd issues
  run(process.execPath, [process.env.npm_execpath, 'install'])
  step('Installing Python and backend packages')
  run(uv, ['sync', '--directory', 'backend'])
}

// Create .env from the template if it is missing and return whether it already holds an API key.
function createEnvFile() {
  step('Checking .env')
  const envFile = join(root, '.env')
  if (ensureEnvFile(envFile, join(root, '.env.example'))) {
    console.log('Created .env from .env.example.')
  } else {
    console.log('.env already exists, so its contents were preserved.')
  }
  return hasApiKey(readFileSync(envFile, 'utf8'))
}

// Ask for the API key until one is saved or the teammate skips and return whether one was saved.
async function promptForKey() {
  step('Adding your Congress.gov API key')
  console.log('Get a free key at https://api.congress.gov/sign-up/ if you do not have one.')
  for (let attempt = 1; attempt <= 3; attempt++) {
    const key = (await askHidden('Paste your key (hidden, Enter to skip): ')).trim()
    if (!key) {
      return false
    }
    // Anything else could break the .env format or inject extra lines into it
    if (!/^[A-Za-z0-9_-]+$/.test(key)) {
      console.log('That does not look like an API key. Keys contain only letters and digits.')
      continue
    }
    const result = await checkKey(key)
    if (result === 'rejected') {
      console.log('Congress.gov rejected that key, so it was not saved.')
      continue
    }
    if (result === 'unknown') {
      console.log('Could not reach Congress.gov to check the key, so it was saved unchecked.')
    }
    const envFile = join(root, '.env')
    const text = readFileSync(envFile, 'utf8')
    const line = `CONGRESS_API_KEY=${key}`
    const updated = /^CONGRESS_API_KEY=.*$/m.test(text)
      ? text.replace(/^CONGRESS_API_KEY=.*$/m, line)
      : `${text.trimEnd()}\n${line}\n`
    writeFileSync(envFile, updated)
    console.log(result === 'ok' ? 'Key accepted and saved to .env.' : 'Key saved to .env.')
    return true
  }
  return false
}

// Switch a clean checkout to the selected teammate's branch.
async function switchBranch() {
  step('Checking your branch')
  const current = output('git', ['branch', '--show-current'])
  if (current?.startsWith('dev/')) {
    console.log(`You are on ${current}.`)
    return
  }
  if (!interactive) {
    console.log(`You are on ${current}. Switch with: git switch dev/your-name`)
    return
  }
  if (output('git', ['status', '--porcelain'])) {
    console.log('You have uncommitted changes, so the branch was not switched.')
    return
  }
  const choices = teammates.map((name, i) => `${i + 1}) ${name}`).join('  ')
  const answer = await ask(`Which teammate are you? ${choices}  (Enter to skip) `)
  const name = teammates[Number(answer) - 1] ?? (teammates.includes(answer) ? answer : null)
  if (name) {
    run('git', ['switch', `dev/${name}`])
  } else {
    console.log('Skipped. Switch later with: git switch dev/your-name')
  }
}

try {
  // Every question comes before the slow installs, so the rest can run unattended
  checkNode()
  const uv = await findUv()
  let hasKey = createEnvFile()
  if (!hasKey && interactive) {
    hasKey = await promptForKey()
  }
  await switchBranch()
  installDependencies(uv)

  step('Setup complete')
  if (!hasKey) {
    console.log('Paste your Congress.gov key after CONGRESS_API_KEY= in .env.')
    console.log('Get a free key at https://api.congress.gov/sign-up/')
  }
  if (uv !== 'uv') {
    console.log('Open a new terminal so uv is on your PATH before running other commands.')
  }
  console.log('Run npm run dev to start the app.')
} catch (error) {
  console.error(`\nSetup stopped: ${error.message}`)
  process.exit(1)
}
