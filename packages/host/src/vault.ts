import { createHash } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import * as path from 'node:path'

export interface VaultSettings {
  vault: string
  recentVaults: string[]
}

export interface VaultInfo {
  path: string
  name: string
  scope: string
  recentVaults: { path: string, name: string }[]
  canPick: boolean
}

function pathKey(value: string): string {
  const normalized = path.normalize(value)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/** Source identity, not an authorization token. Old pages must never address a newly selected vault. */
export function vaultScope(vault: string): string {
  return createHash('sha256').update(vault === '' ? '' : pathKey(path.resolve(vault))).digest('hex')
}

export function vaultInfo(settings: VaultSettings, canPick: boolean): VaultInfo {
  const seen = new Set<string>()
  const recentVaults = [settings.vault, ...settings.recentVaults]
    .filter((value) => {
      if (value === '' || seen.has(pathKey(value))) return false
      seen.add(pathKey(value))
      return true
    })
    .slice(0, 8)
    .map(value => ({ path: value, name: path.basename(path.normalize(value)) || value }))
  return {
    path: settings.vault,
    name: settings.vault === '' ? '' : path.basename(path.normalize(settings.vault)) || settings.vault,
    scope: vaultScope(settings.vault),
    recentVaults,
    canPick,
  }
}

async function isType(filename: string, kind: 'file' | 'directory'): Promise<boolean> {
  try {
    const entry = await stat(filename)
    return kind === 'file' ? entry.isFile() : entry.isDirectory()
  } catch {
    return false
  }
}

/** Match Agentero CLI's existing-vault markers; selection never initializes a directory. */
export async function validateVault(input: string): Promise<string> {
  const value = input.trim()
  if (/[\u0000-\u001f]/.test(value) || !path.isAbsolute(value)
    || (process.platform === 'win32' && path.parse(value).root.length < 3)) throw new Error('invalid vault')
  let root: string
  try { root = await realpath(value) } catch { throw new Error('invalid vault') }
  if (!await isType(root, 'directory')) throw new Error('invalid vault')
  if (await isType(path.join(root, '.agentero', 'catalog.sqlite'), 'file')) return root
  const markers = await Promise.all(['.agentero', 'papers', 'notes'].map(name => isType(path.join(root, name), 'directory')))
  if (markers.every(Boolean)) return root
  throw new Error('invalid vault')
}

/** Validate first and publish through DSH's durable config writer. A failed write leaves the old vault intact. */
export async function selectVault(
  settings: VaultSettings,
  input: string,
  persist: (next: VaultSettings) => Promise<void>,
): Promise<VaultSettings> {
  const vault = await validateVault(input)
  const next = { vault, recentVaults: vaultInfo({ vault, recentVaults: [settings.vault, ...settings.recentVaults] }, false).recentVaults.map(item => item.path) }
  await persist(next)
  return next
}
