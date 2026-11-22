// Point git at the repo's hooks folder and add git get-latest. npm runs this automatically
// after npm install.
import { execFileSync } from 'node:child_process'

try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' })
} catch (error) {
  // Outside a git checkout, such as a downloaded zip, there is nothing to configure
  if (error.status !== 128) throw error
  process.exit(0)
}

// A checkout needs its push protection, so configuration errors must fail installation.
try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' })
} catch {
  console.error('Could not install the git hooks. Resolve the git configuration error and rerun npm run prepare.')
  process.exit(1)
}

// The alias lives in this clone only, and git runs it from the repo root. The trailing -- passes
// options such as --abort through npm to the script.
try {
  execFileSync('git', ['config', 'alias.get-latest', '!npm run --silent get-latest --'], { stdio: 'inherit' })
} catch {
  console.error('Could not add git get-latest. Resolve the git configuration error and rerun npm run prepare.')
  process.exit(1)
}
