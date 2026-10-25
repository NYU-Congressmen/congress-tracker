// Point git at the repo's hooks folder. npm runs this automatically after npm install.
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
