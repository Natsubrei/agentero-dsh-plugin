/**
 * Browser client bundle for one workspace package.
 * Externals stay require() calls. The file registers through __ModuleLoader__.
 */
import * as esbuild from 'esbuild'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const pkgDir = process.cwd()
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
const outfile = join(pkgDir, 'lib/client.js')

const plugins = [
  {
    name: 'dsh-client-externals',
    setup(build) {
      build.onResolve({ filter: /^(?:react|react-dom)(?:\/|$)/ }, args => ({
        path: args.path,
        external: true,
      }))
        build.onResolve({ filter: /^@deepseek-ai\/(?:cordis$|dsh-(?:client|api)-)/ }, args => ({
          path: args.path,
          external: true,
        }))
    },
  },
]

if (pkg.name === 'agentero-dsh-notes') {
  plugins.push({
    name: 'katex-css-stub',
    setup(build) {
      // MathML output does not need KaTeX fonts. The math plugin still imports
      // katex.min.css, and those relative font urls cannot be bundled here.
      build.onResolve({ filter: /katex\.min\.css$/ }, (args) => ({
        path: args.path,
        namespace: 'katex-css-stub',
      }))
      build.onLoad({ filter: /.*/, namespace: 'katex-css-stub' }, () => ({
        contents: '',
        loader: 'js',
      }))
    },
  })
}

if (pkg.name === 'agentero-dsh-pdf') {
  plugins.push({
    name: 'pdfium-wasm-base',
    setup(build) {
      // esbuild lowers import.meta.url to an empty object in this CJS bundle.
      // PDFium then does new URL('pdfium.wasm', import.meta.url) and throws.
      // Point that base at the host wasm route. Blob workers share this origin.
      build.onLoad({ filter: /pdfium[/\\].*\.js$/ }, (args) => {
        if (!args.path.includes('@embedpdf')) return undefined
        const contents = readFileSync(args.path, 'utf8').replaceAll(
          'import.meta.url',
          '(location.origin + "/agentero/api/pdfium.wasm")',
        )
        return { contents, loader: 'js' }
      })
    },
  })
}

function matchingBrace(css, open) {
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return css.length - 1
}

function prefixSelector(selector, scope) {
  return selector.split(',').map((part) => {
    const trimmed = part.trim()
    if (trimmed === '' || trimmed.includes(scope) || trimmed.includes('.agentero-surface')) return part
    if (trimmed.startsWith(':root') || trimmed.startsWith('html') || trimmed.startsWith('@')) return part
    return `${scope} ${trimmed}, ${scope}${trimmed}`
  }).join(',')
}

function scopeSelectors(css, scope) {
  let out = ''
  let i = 0
  while (i < css.length) {
    if (css.startsWith('@keyframes', i) || css.startsWith('@property', i) || css.startsWith('@font-face', i)) {
      const end = matchingBrace(css, css.indexOf('{', i)) + 1
      out += css.slice(i, end)
      i = end
      continue
    }
    if (css[i] === '@') {
      const brace = css.indexOf('{', i)
      out += css.slice(i, brace + 1)
      const innerEnd = matchingBrace(css, brace)
      out += scopeSelectors(css.slice(brace + 1, innerEnd), scope)
      out += '}'
      i = innerEnd + 1
      continue
    }
    const brace = css.indexOf('{', i)
    if (brace === -1) {
      out += css.slice(i)
      break
    }
    out += `${prefixSelector(css.slice(i, brace), scope)}{`
    const innerEnd = matchingBrace(css, brace)
    const inner = css.slice(brace + 1, innerEnd)
    out += inner.includes('{') ? scopeSelectors(inner, scope) : inner
    out += '}'
    i = innerEnd + 1
  }
  return out
}

function compileTailwind(dir) {
  const input = join(dir, 'src/client/tailwind.css')
  if (!existsSync(input)) return ''
  const source = readFileSync(input, 'utf8')
  const scope = source.match(/scope:\s*(\.[A-Za-z0-9_-]+)/)?.[1]
  const cli = join(dir, '../../node_modules/@tailwindcss/cli/dist/index.mjs')
  const compiled = spawnSync(process.execPath, [cli, '-i', input, '--minify'], {
    cwd: dir,
    encoding: 'utf8',
  })
  if (compiled.status !== 0) {
    throw new Error(compiled.stderr || compiled.stdout || 'tailwind compile failed')
  }
  return scope === undefined ? compiled.stdout : scopeSelectors(compiled.stdout, scope)
}

const result = await esbuild.build({
  absWorkingDir: pkgDir,
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2023',
  // Classic JSX emits React.createElement. These files import named hooks only,
  // so the React namespace is missing and the guide icon throws.
  jsx: 'automatic',
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
  plugins,
})

const bundled = result.outputFiles[0]?.text
if (bundled === undefined) {
  throw new Error(`build-client: ${pkg.name} produced no output`)
}

const css = compileTailwind(pkgDir)
const styleInject = css === '' ? '' : `if (typeof document !== "undefined") {
  var styleId = ${JSON.stringify(`${pkg.name}-tailwind`)};
  if (!document.getElementById(styleId)) {
    var style = document.createElement("style");
    style.id = styleId;
    style.textContent = ${JSON.stringify(css)};
    document.head.appendChild(style);
  }
}
`

const body = [
  'var module = { exports: {} };',
  'var exports = module.exports;',
  styleInject,
  bundled.trimEnd(),
  'return module.exports;',
].join('\n')

const source = `window.__ModuleLoader__.load({\n\tid: ${JSON.stringify(pkg.name)},\n\tfactory: (require) => {\n${body}\n}\n});\n`

mkdirSync(dirname(outfile), { recursive: true })
writeFileSync(outfile, source)
