// Point git at the repo's hooks folder. npm runs this automatically after npm install.
import { execFileSync } from 'node:child_process'

try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' })
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'])
} catch {
  // Outside a git checkout, such as a downloaded zip, there is nothing to configure
}
