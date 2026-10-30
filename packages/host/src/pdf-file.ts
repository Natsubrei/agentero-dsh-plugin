import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import * as path from 'node:path'
import { locateVaultPath } from './notes-files.js'

export type PdfReadResult =
  | { status: 200, bytes: Buffer }
  | { status: 400 | 404, error: string }

function ioCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

async function readRegularFile(realPath: string): Promise<PdfReadResult> {
  const stat = await lstat(realPath)
  if (!stat.isFile()) return { status: 400, error: 'invalid path' }
  return { status: 200, bytes: await readFile(realPath) }
}

/**
 * Read one PDF.
 * A `ref` ending in `.pdf` is that file.
 * Any other ref is a paper directory: prefer `<dirname>.pdf`, else the first
 * direct-child `.pdf` in locale order. Nested directories are not searched.
 */
export async function readVaultPdf(vault: string, rawRef: string): Promise<PdfReadResult> {
  const located = await locateVaultPath(vault, rawRef)
  if (!located.ok) return { status: located.status, error: located.error }
  const { root, relative, lexical } = located.location

  if (relative.toLowerCase().endsWith('.pdf')) {
    let real: string
    try {
      real = await realpath(lexical)
    } catch (error) {
      const code = ioCode(error)
      if (code === 'ENOENT') return { status: 404, error: 'not found' }
      if (code === 'ELOOP' || code === 'ENOTDIR') return { status: 400, error: 'invalid path' }
      throw error
    }
    const relativeToRoot = path.relative(root, real)
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
      return { status: 400, error: 'invalid path' }
    }
    return readRegularFile(real)
  }

  let dirReal: string
  try {
    dirReal = await realpath(lexical)
  } catch (error) {
    const code = ioCode(error)
    if (code === 'ENOENT') return { status: 404, error: 'not found' }
    if (code === 'ELOOP' || code === 'ENOTDIR') return { status: 400, error: 'invalid path' }
    throw error
  }
  const relativeToRoot = path.relative(root, dirReal)
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    return { status: 400, error: 'invalid path' }
  }
  const dirStat = await lstat(dirReal)
  if (!dirStat.isDirectory()) return { status: 400, error: 'invalid path' }

  const entries = await readdir(dirReal, { withFileTypes: true })
  const pdfs = entries
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right))
  if (pdfs.length === 0) return { status: 404, error: 'not found' }
  const preferred = `${path.posix.basename(relative)}.pdf`
  const name = pdfs.find(item => item === preferred) ?? pdfs[0]
  if (name === undefined) return { status: 404, error: 'not found' }
  return readRegularFile(path.join(dirReal, name))
}
