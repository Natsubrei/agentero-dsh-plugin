import type { ChildProcess } from 'node:child_process'
import { cliFailure, runAgentero } from './cli-run.js'

/** Network-backed CLI calls: import, download, BibTeX, arXiv discovery. */
const NETWORK_MS = 120_000

/** Local catalog edits. */
const LOCAL_MS = 20_000

export interface CatalogSettings {
  vault: string
  agenteroBin: string
}

export type CatalogResult =
  | { status: 200, raw: string }
  | { status: 502, error: string }

async function cliJson(
  settings: CatalogSettings,
  args: readonly string[],
  timeoutMs: number,
  label: string,
  children: Set<ChildProcess>,
  stdin?: string,
): Promise<CatalogResult> {
  const result = await runAgentero(settings.agenteroBin, [
    '--vault', settings.vault,
    '--json',
    ...args,
  ], timeoutMs, children, stdin)
  if (result.timedOut || result.spawnError !== undefined || result.code !== 0) {
    return { status: 502, error: cliFailure(result, label) }
  }
  try {
    JSON.parse(result.stdout)
  } catch {
    return { status: 502, error: `${label} returned invalid JSON` }
  }
  return { status: 200, raw: result.stdout }
}

/** `agentero import id`. `text` is an arXiv id, DOI, or URL. */
export function importId(
  settings: CatalogSettings,
  text: string,
  children: Set<ChildProcess>,
): Promise<CatalogResult> {
  return cliJson(settings, ['import', 'id', '--', text], NETWORK_MS, 'agentero import id', children)
}

/** `agentero import bib -`, with the BibTeX document on stdin. */
export function importBib(
  settings: CatalogSettings,
  text: string,
  children: Set<ChildProcess>,
): Promise<CatalogResult> {
  return cliJson(settings, ['import', 'bib', '-'], NETWORK_MS, 'agentero import bib', children, text)
}

/** `agentero export bib`. JSON `data.content` is the BibTeX. */
export function exportBib(
  settings: CatalogSettings,
  children: Set<ChildProcess>,
): Promise<CatalogResult> {
  return cliJson(settings, ['export', 'bib'], NETWORK_MS, 'agentero export bib', children)
}

/** Append or remove one tag. The ref is a vault-relative paper path or id. */
export function changeTag(
  settings: CatalogSettings,
  ref: string,
  op: 'add' | 'rm',
  tag: string,
  children: Set<ChildProcess>,
): Promise<CatalogResult> {
  return cliJson(
    settings,
    ['paper', 'tag', op, ref, '--', tag],
    LOCAL_MS,
    'agentero paper tag',
    children,
  )
}

/** Move a paper directory to the vault recycle bin. Does not pass `--files`. */
export function deletePaper(
  settings: CatalogSettings,
  ref: string,
  children: Set<ChildProcess>,
): Promise<CatalogResult> {
  return cliJson(settings, ['paper', 'delete', ref], LOCAL_MS, 'agentero paper delete', children)
}

/** Set catalog `is_read`. */
export function setRead(
  settings: CatalogSettings,
  ref: string,
  read: boolean,
  children: Set<ChildProcess>,
): Promise<CatalogResult> {
  const args = ['paper', 'set-read', ref]
  if (!read) args.push('--false')
  return cliJson(settings, args, LOCAL_MS, 'agentero paper set-read', children)
}

/** Download the PDF for a paper already in the catalog. */
export function downloadPaper(
  settings: CatalogSettings,
  ref: string,
  children: Set<ChildProcess>,
): Promise<CatalogResult> {
  return cliJson(settings, ['paper', 'download', ref], NETWORK_MS, 'agentero paper download', children)
}

/** Rank a short arXiv list for one keyword. Already-imported ids are dropped by the CLI. */
export function discoverArxiv(
  settings: CatalogSettings,
  keyword: string,
  children: Set<ChildProcess>,
): Promise<CatalogResult> {
  return cliJson(
    settings,
    ['discover', 'arxiv', '--keyword', keyword, '--top', '8'],
    NETWORK_MS,
    'agentero discover arxiv',
    children,
  )
}
