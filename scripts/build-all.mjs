import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tsc = join(root, 'node_modules/typescript/bin/tsc')
const packages = ['host', 'library', 'notes', 'pdf', 'recommend']
const noEmit = process.argv.includes('--noEmit')

function run(cwd, args) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

for (const name of packages) {
  const dir = join(root, 'packages', name)
  const emit = noEmit ? ['--noEmit'] : []
  run(dir, [tsc, '-p', 'tsconfig.json', ...emit])
  run(dir, [tsc, '-p', 'tsconfig.client.json', ...emit])
  if (!noEmit) {
    run(dir, [join(root, 'scripts/build-client.mjs')])
    const client = readFileSync(join(dir, 'lib/client.js'), 'utf8')
    if (!client.startsWith('window.__ModuleLoader__.load(')) {
      throw new Error(`${name}: lib/client.js does not start with __ModuleLoader__.load`)
    }
    run(dir, ['--check', 'lib/index.js'])
    run(dir, ['--check', 'lib/client.js'])
  }
}
