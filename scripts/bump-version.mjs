import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = process.argv[2]

if (version === undefined || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('usage: node scripts/bump-version.mjs <version>, e.g. 0.1.1 or 0.2.0-beta.1')
  process.exit(1)
}

const paths = [
  join(root, 'package.json'),
  ...readdirSync(join(root, 'packages')).map(name => join(root, 'packages', name, 'package.json')),
]
for (const path of paths) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  manifest.version = version
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`${manifest.name} ${version}`)
}
