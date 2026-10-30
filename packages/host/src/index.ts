import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import type { ChildProcess } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { cliFailure, runAgentero } from './cli-run.js'
import {
  changeTag, deletePaper, discoverArxiv, downloadPaper, exportBib, importBib, importId, setRead,
} from './catalog.js'
import { listVaultNotes, readVaultFile, writeVaultNote } from './notes-files.js'
import { readVaultPdf } from './pdf-file.js'
import { registerTools } from './tools.js'
import { selectVault, vaultInfo, vaultScope } from './vault.js'

/** Cordis plugin name. The loader row id matches this name. */
export const name = 'agentero-host'

/** HTTP routes are registered on the composition web server. `agents` cites into a session. `tools` exposes the vault to the model. */
export const inject = ['webServer', 'agents', 'tools', 'settings']

/** Optional host settings. Omitted fields use the defaults below. */
export interface Config {
  /** Vault directory. Empty until a later step opens it. */
  vault: string
  /** Executable name used to reach the Agentero CLI. */
  agenteroBin: string
  /** Last selected knowledge bases in this DSH profile. */
  recentVaults: string[]
}

export const Config = z.object({
  vault: z.string().default(''),
  agenteroBin: z.string().default('agentero'),
  recentVaults: z.array(z.string()).default([]),
})

/** Prefix owned by this plugin. Longer paths under it are answered here. */
const API_PREFIX = '/agentero/api'
const VAULT_PATH = '/agentero/api/vault'
const VAULT_PICK_PATH = '/agentero/api/vault/pick'

/** Paper list route. */
const PAPERS_PATH = '/agentero/api/papers'

/** Markdown notes under the configured vault. */
const NOTES_PATH = '/agentero/api/notes'

/** Read or write one vault-relative file. Writes stay under `notes/` or one paper `NOTES.md`. */
const NOTES_FILE_PATH = '/agentero/api/notes/file'

/** PDF bytes for a paper directory or a `.pdf` path. */
const PDF_PATH = '/agentero/api/pdf'
const PDFIUM_WASM_PATH = '/agentero/api/pdfium.wasm'
const require = createRequire(import.meta.url)

/** List or add reading marks through the Agentero CLI. */
const MARKS_PATH = '/agentero/api/marks'

/** Queue a citation into the still-selected dsh session. */
const CONTEXT_PATH = '/agentero/api/context'

/** Import one identifier, or BibTeX on the `/bib` path. */
const IMPORT_PATH = '/agentero/api/import'
const IMPORT_BIB_PATH = '/agentero/api/import/bib'

/** BibTeX export of the catalog. */
const EXPORT_BIB_PATH = '/agentero/api/export/bib'

/** Add or remove one tag. */
const TAGS_PATH = '/agentero/api/papers/tags'

/** Move a paper to the recycle bin. */
const DELETE_PATH = '/agentero/api/papers/delete'

/** Set `is_read`. */
const READ_PATH = '/agentero/api/papers/read'

/** Download a missing PDF. */
const DOWNLOAD_PATH = '/agentero/api/papers/download'

/** Short arXiv ranking for one keyword. */
const DISCOVER_PATH = '/agentero/api/discover'

/** Bound for one `paper list` or `mark list` process. A timeout kills the child. */
const PAPER_LIST_TIMEOUT_MS = 20_000

/** `mark add` may run PDFium and a translation request. */
const MARK_ADD_TIMEOUT_MS = 90_000

/** Largest JSON body accepted by `PUT /agentero/api/notes/file`. */
const NOTE_BODY_LIMIT = 8 * 1024 * 1024

function settingsFrom(config: unknown): Config {
  const raw = config !== null && typeof config === 'object' ? config as Record<string, unknown> : {}
  return {
    vault: typeof raw.vault === 'string' ? raw.vault : '',
    agenteroBin: typeof raw.agenteroBin === 'string' ? raw.agenteroBin : 'agentero',
    recentVaults: Array.isArray(raw.recentVaults) ? raw.recentVaults.filter((value): value is string => typeof value === 'string') : [],
  }
}

interface VaultHost {
  canPick(): boolean
  pick(signal: AbortSignal): Promise<string | null>
  save(input: string): Promise<ReturnType<typeof vaultInfo>>
}

interface DirectoryPickerLike {
  capability(): { kind: string, pick?: (signal: AbortSignal) => Promise<string | null> }
}

interface SettingsLike {
  mutate(namespace: string, ops: { op: 'set', path: string[], value: unknown }[]): Promise<void>
}

/** Host header name without the port. Bracketed IPv6 keeps the address inside the brackets. */
function hostName(header: string | undefined): string | undefined {
  if (header === undefined) return undefined
  const value = header.trim().toLowerCase()
  if (value === '') return undefined
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    if (end < 2) return undefined
    return value.slice(1, end)
  }
  if (value === '::1') return value
  const colon = value.lastIndexOf(':')
  if (colon === -1) return value
  if (value.indexOf(':') !== colon) return undefined
  return value.slice(0, colon)
}

/** True when the request Host names this machine's loopback. */
function isLoopbackHost(header: string | undefined): boolean {
  const name = hostName(header)
  return name === '127.0.0.1' || name === 'localhost' || name === '::1'
}

function pathnameOf(req: IncomingMessage): string | undefined {
  try {
    return new URL(req.url ?? '/', 'http://127.0.0.1').pathname
  } catch {
    return undefined
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

function sendRawJson(res: ServerResponse, body: string): void {
  res.statusCode = 200
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(body)
}

/** Minimal agent face. The message is queued for the next model step and does not wake the driver. */
interface AgentInject {
  inject(message: {
    id: string
    role: 'user'
    content: readonly { type: 'text', text: string }[]
    source: { kind: 'user' }
  }): void
}

interface AgentRegistryLike {
  get(id: string): AgentInject | undefined
}

function queryPath(req: IncomingMessage): string | null {
  try {
    return new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('path')
  } catch {
    return null
  }
}

function readTextBody(req: IncomingMessage): Promise<string | undefined> {
  const declared = req.headers['content-length']
  if (declared !== undefined) {
    const length = Number(declared)
    if (!Number.isFinite(length) || length > NOTE_BODY_LIMIT) return Promise.resolve(undefined)
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const cleanup = (): void => {
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onError)
    }
    const finish = (value: string | undefined, error?: unknown): void => {
      if (settled) return
      settled = true
      cleanup()
      if (error !== undefined) reject(error instanceof Error ? error : new Error(String(error)))
      else resolve(value)
    }
    const onData = (chunk: Buffer | string): void => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > NOTE_BODY_LIMIT) {
        finish(undefined)
        return
      }
      chunks.push(buffer)
    }
    const onEnd = (): void => {
      finish(Buffer.concat(chunks).toString('utf8'))
    }
    const onError = (error: Error): void => {
      finish(undefined, error)
    }
    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onError)
  })
}

function textFromBody(raw: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    if (!('text' in parsed) || typeof parsed.text !== 'string') return undefined
    return parsed.text
  } catch {
    return undefined
  }
}

function requireVault(settings: Config, res: ServerResponse): boolean {
  if (settings.vault !== '') return true
  sendJson(res, 503, { error: 'vault is not configured' })
  return false
}

async function handlePapers(
  settings: Config,
  req: IncomingMessage,
  res: ServerResponse,
  children: Set<ChildProcess>,
): Promise<void> {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('allow', 'GET')
    res.end()
    return
  }
  if (!requireVault(settings, res)) return
  const result = await runAgentero(settings.agenteroBin, [
    '--vault', settings.vault,
    '--json',
    'paper', 'list',
    '--fields', 'year,authors,tags,date',
  ], PAPER_LIST_TIMEOUT_MS, children)
  if (result.timedOut || result.spawnError !== undefined || result.code !== 0) {
    sendJson(res, 502, { error: cliFailure(result, 'agentero paper list') })
    return
  }
  try {
    JSON.parse(result.stdout)
  } catch {
    sendJson(res, 502, { error: 'agentero paper list returned invalid JSON' })
    return
  }
  sendRawJson(res, result.stdout)
}

async function handleNotesList(settings: Config, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('allow', 'GET')
    res.end()
    return
  }
  if (!requireVault(settings, res)) return
  const notes = await listVaultNotes(settings.vault)
  sendJson(res, 200, { notes })
}

async function handleNotesFile(settings: Config, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.statusCode = 405
    res.setHeader('allow', 'GET, PUT')
    res.end()
    return
  }
  if (!requireVault(settings, res)) return
  const rawPath = queryPath(req)
  if (rawPath === null) {
    sendJson(res, 400, { error: 'invalid path' })
    return
  }
  if (req.method === 'GET') {
    const result = await readVaultFile(settings.vault, rawPath)
    if (result.status === 200) {
      sendJson(res, 200, { path: result.path, text: result.text })
      return
    }
    sendJson(res, result.status, { error: result.error })
    return
  }
  const raw = await readTextBody(req)
  if (raw === undefined) {
    sendJson(res, 400, { error: 'invalid body' })
    req.destroy()
    return
  }
  const text = textFromBody(raw)
  if (text === undefined) {
    sendJson(res, 400, { error: 'invalid body' })
    return
  }
  const result = await writeVaultNote(settings.vault, rawPath, text)
  if (result.status === 200) {
    sendJson(res, 200, { path: result.path })
    return
  }
  sendJson(res, result.status, { error: result.error })
}

function queryParam(req: IncomingMessage, name: string): string | null {
  try {
    return new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get(name)
  } catch {
    return null
  }
}

function pdfiumWasmFile(): string {
  return require.resolve('@embedpdf/pdfium/pdfium.wasm')
}

/** PDFium wasm for the browser engine. The worker fetches this by absolute URL. */
function handlePdfiumWasm(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('allow', 'GET, HEAD')
    res.end()
    return
  }
  let file: string
  try {
    file = pdfiumWasmFile()
  } catch {
    sendJson(res, 404, { error: 'pdfium wasm missing' })
    return
  }
  res.statusCode = 200
  res.setHeader('content-type', 'application/wasm')
  res.setHeader('cache-control', 'public, max-age=86400')
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = createReadStream(file)
  stream.on('error', () => {
    if (!res.headersSent) res.statusCode = 404
    res.end()
  })
  stream.pipe(res)
}

async function handlePdf(settings: Config, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('allow', 'GET')
    res.end()
    return
  }
  if (!requireVault(settings, res)) return
  const ref = queryParam(req, 'ref')
  if (ref === null || ref.trim() === '') {
    sendJson(res, 400, { error: 'invalid path' })
    return
  }
  const result = await readVaultPdf(settings.vault, ref)
  if (result.status !== 200) {
    sendJson(res, result.status, { error: result.error })
    return
  }
  res.statusCode = 200
  res.setHeader('content-type', 'application/pdf')
  res.setHeader('cache-control', 'no-store')
  res.end(result.bytes)
}

interface MarkAddBody {
  ref: string
  kind: 'highlight' | 'ask' | 'translate'
  quote: string
  page: number
  comment?: string
  question?: string
  to?: string
}

function markAddFrom(raw: string): MarkAddBody | undefined {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const record = parsed as Record<string, unknown>
    const ref = typeof record.ref === 'string' ? record.ref.trim() : ''
    const quote = typeof record.quote === 'string' ? record.quote.trim() : ''
    const kind = record.kind
    const page = record.page
    if (ref === '' || quote === '') return undefined
    if (kind !== 'highlight' && kind !== 'ask' && kind !== 'translate') return undefined
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) return undefined
    const body: MarkAddBody = { ref, kind, quote, page }
    if (typeof record.comment === 'string' && record.comment.trim() !== '') body.comment = record.comment
    if (typeof record.question === 'string' && record.question.trim() !== '') body.question = record.question
    if (typeof record.to === 'string' && record.to.trim() !== '') body.to = record.to.trim()
    return body
  } catch {
    return undefined
  }
}

async function finishCliJson(
  res: ServerResponse,
  result: Awaited<ReturnType<typeof runAgentero>>,
  label: string,
): Promise<void> {
  if (result.timedOut || result.spawnError !== undefined || result.code !== 0) {
    sendJson(res, 502, { error: cliFailure(result, label) })
    return
  }
  try {
    JSON.parse(result.stdout)
  } catch {
    sendJson(res, 502, { error: `${label} returned invalid JSON` })
    return
  }
  sendRawJson(res, result.stdout)
}

async function handleMarks(
  settings: Config,
  req: IncomingMessage,
  res: ServerResponse,
  children: Set<ChildProcess>,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('allow', 'GET, POST')
    res.end()
    return
  }
  if (!requireVault(settings, res)) return
  if (req.method === 'GET') {
    const ref = queryParam(req, 'ref')
    if (ref === null || ref.trim() === '') {
      sendJson(res, 400, { error: 'invalid path' })
      return
    }
    const result = await runAgentero(settings.agenteroBin, [
      '--vault', settings.vault,
      '--json',
      'mark', 'list', ref,
    ], PAPER_LIST_TIMEOUT_MS, children)
    await finishCliJson(res, result, 'agentero mark list')
    return
  }
  const raw = await readTextBody(req)
  if (raw === undefined) {
    sendJson(res, 400, { error: 'invalid body' })
    req.destroy()
    return
  }
  const body = markAddFrom(raw)
  if (body === undefined) {
    sendJson(res, 400, { error: 'invalid body' })
    return
  }
  const args = [
    '--vault', settings.vault,
    '--json',
    'mark', 'add', body.ref,
    '--kind', body.kind,
    '--quote', body.quote,
    '--page', String(body.page),
  ]
  if (body.comment !== undefined) args.push('--comment', body.comment)
  if (body.question !== undefined) args.push('--question', body.question)
  if (body.to !== undefined) args.push('--to', body.to)
  const result = await runAgentero(settings.agenteroBin, args, MARK_ADD_TIMEOUT_MS, children)
  await finishCliJson(res, result, 'agentero mark add')
}

function contextFrom(raw: string): { sessionId: string, text: string } | undefined {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const record = parsed as Record<string, unknown>
    const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
    const text = typeof record.text === 'string' ? record.text.trim() : ''
    if (sessionId === '' || text === '') return undefined
    return { sessionId, text }
  } catch {
    return undefined
  }
}

async function handleContext(
  agents: AgentRegistryLike,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('allow', 'POST')
    res.end()
    return
  }
  const raw = await readTextBody(req)
  if (raw === undefined) {
    sendJson(res, 400, { error: 'invalid body' })
    req.destroy()
    return
  }
  const body = contextFrom(raw)
  if (body === undefined) {
    sendJson(res, 400, { error: 'invalid body' })
    return
  }
  const agent = agents.get(body.sessionId)
  if (agent === undefined) {
    sendJson(res, 404, { error: 'session not found' })
    return
  }
  agent.inject({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text: body.text }],
    source: { kind: 'user' },
  })
  sendJson(res, 200, { ok: true })
}

function objectBody(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}

async function readObject(req: IncomingMessage, res: ServerResponse): Promise<Record<string, unknown> | undefined> {
  const raw = await readTextBody(req)
  if (raw === undefined) {
    sendJson(res, 400, { error: 'invalid body' })
    req.destroy()
    return undefined
  }
  const body = objectBody(raw)
  if (body === undefined) sendJson(res, 400, { error: 'invalid body' })
  return body
}

function requirePost(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.method === 'POST') return true
  res.statusCode = 405
  res.setHeader('allow', 'POST')
  res.end()
  return false
}

async function sendCatalog(
  res: ServerResponse,
  result: { status: 200, raw: string } | { status: 502, error: string },
): Promise<void> {
  if (result.status !== 200) {
    sendJson(res, result.status, { error: result.error })
    return
  }
  sendRawJson(res, result.raw)
}

async function handleImport(
  settings: Config,
  req: IncomingMessage,
  res: ServerResponse,
  children: Set<ChildProcess>,
): Promise<void> {
  if (!requirePost(req, res) || !requireVault(settings, res)) return
  const body = await readObject(req, res)
  if (body === undefined) return
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (text === '') {
    sendJson(res, 400, { error: 'invalid body' })
    return
  }
  await sendCatalog(res, await importId(settings, text, children))
}

async function handleImportBib(
  settings: Config,
  req: IncomingMessage,
  res: ServerResponse,
  children: Set<ChildProcess>,
): Promise<void> {
  if (!requirePost(req, res) || !requireVault(settings, res)) return
  const body = await readObject(req, res)
  if (body === undefined) return
  const text = typeof body.text === 'string' ? body.text : ''
  if (text.trim() === '') {
    sendJson(res, 400, { error: 'invalid body' })
    return
  }
  await sendCatalog(res, await importBib(settings, text, children))
}

async function handleExportBib(
  settings: Config,
  req: IncomingMessage,
  res: ServerResponse,
  children: Set<ChildProcess>,
): Promise<void> {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('allow', 'GET')
    res.end()
    return
  }
  if (!requireVault(settings, res)) return
  await sendCatalog(res, await exportBib(settings, children))
}

async function handleTags(
  settings: Config,
  req: IncomingMessage,
  res: ServerResponse,
  children: Set<ChildProcess>,
): Promise<void> {
  if (!requirePost(req, res) || !requireVault(settings, res)) return
  const body = await readObject(req, res)
  if (body === undefined) return
  const ref = typeof body.ref === 'string' ? body.ref.trim() : ''
  const tag = typeof body.tag === 'string' ? body.tag.trim() : ''
  const op = body.op
  if (ref === '' || tag === '' || (op !== 'add' && op !== 'rm')) {
    sendJson(res, 400, { error: 'invalid body' })
    return
  }
  await sendCatalog(res, await changeTag(settings, ref, op, tag, children))
}

async function handleDelete(
  settings: Config,
  req: IncomingMessage,
  res: ServerResponse,
  children: Set<ChildProcess>,
): Promise<void> {
  if (!requirePost(req, res) || !requireVault(settings, res)) return
  const body = await readObject(req, res)
  if (body === undefined) return
  const ref = typeof body.ref === 'string' ? body.ref.trim() : ''
  if (ref === '') {
    sendJson(res, 400, { error: 'invalid body' })
    return
  }
  await sendCatalog(res, await deletePaper(settings, ref, children))
}

async function handleReadFlag(
  settings: Config,
  req: IncomingMessage,
  res: ServerResponse,
  children: Set<ChildProcess>,
): Promise<void> {
  if (!requirePost(req, res) || !requireVault(settings, res)) return
  const body = await readObject(req, res)
  if (body === undefined) return
  const ref = typeof body.ref === 'string' ? body.ref.trim() : ''
  if (ref === '' || typeof body.read !== 'boolean') {
    sendJson(res, 400, { error: 'invalid body' })
    return
  }
  await sendCatalog(res, await setRead(settings, ref, body.read, children))
}

async function handleDownload(
  settings: Config,
  req: IncomingMessage,
  res: ServerResponse,
  children: Set<ChildProcess>,
): Promise<void> {
  if (!requirePost(req, res) || !requireVault(settings, res)) return
  const body = await readObject(req, res)
  if (body === undefined) return
  const ref = typeof body.ref === 'string' ? body.ref.trim() : ''
  if (ref === '') {
    sendJson(res, 400, { error: 'invalid body' })
    return
  }
  await sendCatalog(res, await downloadPaper(settings, ref, children))
}

async function handleDiscover(
  settings: Config,
  req: IncomingMessage,
  res: ServerResponse,
  children: Set<ChildProcess>,
): Promise<void> {
  if (!requirePost(req, res) || !requireVault(settings, res)) return
  const body = await readObject(req, res)
  if (body === undefined) return
  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : ''
  if (keyword === '') {
    sendJson(res, 400, { error: 'invalid body' })
    return
  }
  await sendCatalog(res, await discoverArxiv(settings, keyword, children))
}

async function handleApi(
  settings: Config,
  agents: AgentRegistryLike,
  req: IncomingMessage,
  res: ServerResponse,
  children: Set<ChildProcess>,
  vaultHost: VaultHost,
): Promise<void> {
  if (!isLoopbackHost(req.headers.host)) {
    res.statusCode = 403
    res.end()
    return
  }
  const pathname = pathnameOf(req)
  if (pathname === VAULT_PATH && req.method === 'GET') {
    sendJson(res, 200, vaultInfo(settings, vaultHost.canPick()))
    return
  }
  if (pathname !== PDFIUM_WASM_PATH && req.headers['x-agentero-vault'] !== vaultScope(settings.vault)) {
    sendJson(res, 409, { error: 'vault changed' })
    return
  }
  if (pathname === VAULT_PATH || pathname === VAULT_PICK_PATH) {
    const expectedMethod = pathname === VAULT_PATH ? 'PUT' : 'POST'
    if (req.method !== expectedMethod) {
      res.statusCode = 405
      res.setHeader('allow', expectedMethod)
      res.end()
      return
    }
    // JSON + same-origin prevents a website from opening a host chooser or changing the profile.
    const origin = req.headers.origin
    if ((origin !== undefined && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`)
      || !req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      sendJson(res, 403, { error: 'invalid origin' })
      return
    }
    if (pathname === VAULT_PICK_PATH) {
      if (!vaultHost.canPick()) { sendJson(res, 409, { error: 'directory picker unavailable' }); return }
      const controller = new AbortController()
      const abort = (): void => { controller.abort() }
      res.once('close', abort)
      try { sendJson(res, 200, { path: await vaultHost.pick(controller.signal) }) }
      finally { res.off('close', abort) }
      return
    }
    const body = await readObject(req, res)
    if (body === undefined) return
    if (typeof body.path !== 'string') { sendJson(res, 400, { error: 'invalid vault' }); return }
    try { sendJson(res, 200, await vaultHost.save(body.path)) }
    catch (error) {
      if (error instanceof Error && error.message === 'invalid vault') sendJson(res, 400, { error: 'invalid vault' })
      else throw error
    }
    return
  }
  if (pathname === PAPERS_PATH) {
    await handlePapers(settings, req, res, children)
    return
  }
  if (pathname === NOTES_PATH) {
    await handleNotesList(settings, req, res)
    return
  }
  if (pathname === NOTES_FILE_PATH) {
    await handleNotesFile(settings, req, res)
    return
  }
  if (pathname === PDFIUM_WASM_PATH) {
    handlePdfiumWasm(req, res)
    return
  }
  if (pathname === PDF_PATH) {
    await handlePdf(settings, req, res)
    return
  }
  if (pathname === MARKS_PATH) {
    await handleMarks(settings, req, res, children)
    return
  }
  if (pathname === CONTEXT_PATH) {
    await handleContext(agents, req, res)
    return
  }
  if (pathname === IMPORT_BIB_PATH) {
    await handleImportBib(settings, req, res, children)
    return
  }
  if (pathname === IMPORT_PATH) {
    await handleImport(settings, req, res, children)
    return
  }
  if (pathname === EXPORT_BIB_PATH) {
    await handleExportBib(settings, req, res, children)
    return
  }
  if (pathname === TAGS_PATH) {
    await handleTags(settings, req, res, children)
    return
  }
  if (pathname === DELETE_PATH) {
    await handleDelete(settings, req, res, children)
    return
  }
  if (pathname === READ_PATH) {
    await handleReadFlag(settings, req, res, children)
    return
  }
  if (pathname === DOWNLOAD_PATH) {
    await handleDownload(settings, req, res, children)
    return
  }
  if (pathname === DISCOVER_PATH) {
    await handleDiscover(settings, req, res, children)
    return
  }
  res.statusCode = 404
  res.end()
}

/**
 * Read `vault` and `agenteroBin`. Serve paper list, PDF bytes, marks, and
 * note files under `/agentero/api`. `POST /agentero/api/context` queues a
 * citation on the named session without waking its driver.
 * Config uses the Harness-provided schema so vault selection is persisted
 * through DSH's settings writer, preserving other profile fields.
 * @param ctx - Host plugin context.
 * @param config - Raw loader config. Missing fields use the defaults.
 */
export function apply(ctx: Context, config?: unknown): void {
  const settings = settingsFrom(config)
  const agents = (ctx as Context & { agents: AgentRegistryLike }).agents
  const picker = (): ReturnType<DirectoryPickerLike['capability']> | undefined => (ctx.get('directoryPicker') as DirectoryPickerLike | undefined)?.capability()
  const vaultHost: VaultHost = {
    canPick: () => picker()?.kind === 'native',
    async pick(signal) {
      const capability = picker()
      if (capability?.kind !== 'native' || capability.pick === undefined) throw new Error('directory picker unavailable')
      return capability.pick(signal)
    },
    async save(input) {
      const canPick = vaultHost.canPick()
      const next = await selectVault(settings, input, async (value) => {
        const writer = ctx.get('settings') as SettingsLike
        await writer.mutate('agentero-host', [
          { op: 'set', path: ['vault'], value: value.vault },
          { op: 'set', path: ['recentVaults'], value: value.recentVaults },
        ])
      })
      return vaultInfo(next, canPick)
    },
  }
  ctx.effect(() => {
    console.log('[agentero] plugin loaded')
    const children = new Set<ChildProcess>()
    const route: WebRoute = {
      kind: 'prefix',
      path: API_PREFIX,
      handler: (req, res) => handleApi(settings, agents, req, res, children, vaultHost).catch((error: unknown) => {
        if (res.headersSent) return
        const message = error instanceof Error ? error.message : String(error)
        sendJson(res, 502, { error: message })
      }),
    }
    const disposeTools = registerTools(ctx, settings, children)
    const dispose = ctx.webServer.register(route)
    return () => {
      disposeTools()
      dispose()
      for (const child of children) {
        try {
          child.kill()
        } catch {
          // The child already exited.
        }
      }
      children.clear()
      console.log('[agentero] plugin unloaded')
    }
  })
}
