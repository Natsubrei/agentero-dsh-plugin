import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const dir = await mkdtemp(join(tmpdir(), 'agentero-translation-tests-'))
try {
  const output = join(dir, 'translation.test.mjs')
  await build({ entryPoints: ['packages/pdf/tests/translation.test.ts'], outfile: output, bundle: true, platform: 'node', format: 'esm' })
  const compile = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'packages/host/tsconfig.json'], { stdio: 'inherit' })
  if (compile.status !== 0) process.exitCode = compile.status ?? 1
  else {
    const run = spawnSync(process.execPath, ['--test', 'packages/host/tests/translation.test.mjs', output], { stdio: 'inherit' })
    process.exitCode = run.status ?? 1
  }
} finally { await rm(dir, { recursive: true, force: true }) }
