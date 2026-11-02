import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tag = process.argv[2]

if (tag === undefined) {
  console.error('usage: node scripts/check-release-version.mjs v<version>')
  process.exit(1)
}

const expected = tag.replace(/^v/, '')
const paths = [
  join(root, 'package.json'),
  ...readdirSync(join(root, 'packages')).map(name => join(root, 'packages', name, 'package.json')),
]
const mismatched = []
for (const path of paths) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  console.log(`${manifest.name} ${manifest.version}`)
  if (manifest.version !== expected) mismatched.push(`${manifest.name}@${manifest.version}`)
}

if (mismatched.length > 0) {
  console.error(`tag ${tag} expects version ${expected}, found: ${mismatched.join(', ')}`)
  process.exit(1)
}
