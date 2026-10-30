import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import type { ChildProcess } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { cliFailure, runAgentero } from './cli-run.js'
import {
  changeTag, deletePaper, discoverArxiv, downloadPaper, exportBib, importBib, importId, setRead,
} from './catalog.js'
import { listVaultNotes, locateVaultPath, readVaultFile, within, writeVaultNote } from './notes-files.js'
import { type MarkRect, readMarks, writeMark } from './marks-store.js'
import { bookmarkNodesFrom, writePdfBookmarks } from './bookmarks-write.js'
import { locateVaultPdf, readVaultPdf } from './pdf-file.js'
import { handleRecommendRequest } from './recommend.js'
import { registerTools } from './tools.js'

/** Cordis plugin name. The loader row id matches this name. */
export const name = 'agentero-host'

/** HTTP routes are registered on the composition web server. `agents` cites into a session. `tools` exposes the vault to the model. */
export const inject = ['webServer', 'agents', 'tools']

/** Optional host settings. Omitted fields use the defaults below. */
export interface Config {
  /** Vault directory. Empty until a later step opens it. */
  vault: string
  /** Executable name used to reach the Agentero CLI. */
  agenteroBin: string
  /** Agentero desktop settings file. Empty resolves `$XDG_CONFIG_HOME/agentero/settings.json`. */
  agenteroSettings: string
}

/** Prefix owned by this plugin. Longer paths under it are answered here. */
const API_PREFIX = '/agentero/api'

/** Paper list route. */
const PAPERS_PATH = '/agentero/api/papers'

/** Markdown notes under the configured vault. */
const NOTES_PATH = '/agentero/api/notes'

/** Read or write one vault-relative file. Writes stay under `notes/` or one paper `NOTES.md`. */
const NOTES_FILE_PATH = '/agentero/api/notes/file'

/** PDF bytes for a paper directory or a `.pdf` path. */
const PDF_PATH = '/agentero/api/pdf'
/** Rewrite the outline (bookmarks) of one PDF. */
const PDF_BOOKMARKS_PATH = '/agentero/api/pdf/bookmarks'
const PDFIUM_WASM_PATH = '/agentero/api/pdfium.wasm'
const require = createRequire(import.meta.url)

/** List or add reading marks through the Agentero CLI. */
const MARKS_PATH = '/agentero/api/marks'
/** Serve the PNG crop behind a visual region mark. */
const MARK_ASSET_PATH = '/agentero/api/marks/asset'
/** Translate text with the CLI's free machine translation. */
const TRANSLATE_PATH = '/agentero/api/translate'

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
/** Free machine translation of one page. */
const TRANSLATE_TIMEOUT_MS = 60_000

/** Largest JSON body accepted by `PUT /agentero/api/notes/file`. */
const NOTE_BODY_LIMIT = 8 * 1024 * 1024

function settingsFrom(config: unknown): Config {
  const raw = config !== null && typeof config === 'object' ? config as Record<string, unknown> : {}
  return {
    vault: typeof raw.vault === 'string' ? raw.vault : '',
    agenteroBin: typeof raw.agenteroBin === 'string' ? raw.agenteroBin : 'agentero',
    agenteroSettings: typeof raw.agenteroSettings === 'string' ? raw.agenteroSettings : '',
  }
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

/**
 * Write the outline back into the PDF file.
 * The browser sends the whole tree; the writer keeps original destinations and
 * refuses signed or unsupported documents. The save is atomic (tmp + rename).
 */
async function handlePdfBookmarks(
  settings: Config,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('allow', 'POST')
    res.end()
    return
  }
  if (!requireVault(settings, res)) return
  const raw = await readTextBody(req)
  if (raw === undefined) {
    sendJson(res, 400, { error: 'invalid body' })
    req.destroy()
    return
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    sendJson(res, 400, { error: 'invalid body' })
    return
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    sendJson(res, 400, { error: 'invalid body' })
    return
  }
  const record = parsed as Record<string, unknown>
  const ref = typeof record.ref === 'string' ? record.ref.trim() : ''
  if (ref === '') {
    sendJson(res, 400, { error: 'invalid path' })
    return
  }
  const nodes = bookmarkNodesFrom(record.nodes)
  if (nodes === undefined) {
    sendJson(res, 400, { error: 'invalid bookmarks' })
    return
  }
  const located = await locateVaultPdf(settings.vault, ref)
  if (located.status !== 200) {
    sendJson(res, located.status, { error: located.error })
    return
  }
  let saved: Uint8Array
  try {
    const bytes = await readFile(located.realPath)
    saved = await writePdfBookmarks(bytes, nodes)
  } catch (error) {
    const text = error instanceof Error ? error.message : ''
    sendJson(res, 422, { error: text === '' ? 'could not write bookmarks' : text })
    return
  }
  const temp = `${located.realPath}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(temp, saved)
    await rename(temp, located.realPath)
  } catch {
    await rm(temp, { force: true }).catch(() => undefined)
    sendJson(res, 500, { error: 'could not save bookmarks' })
    return
  }
  sendJson(res, 200, { ok: true })
}

interface MarkAddBody {
  ref: string
  kind: 'highlight' | 'ask' | 'translate' | 'visual'
  quote: string
  page: number
  rects?: MarkRect[]
  pageSize?: { width: number, height: number }
  color?: string
  comment?: string
  question?: string
  to?: string
  asset?: { mediaType: string, data: string }
}

function markRects(value: unknown): MarkRect[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const rects: MarkRect[] = []
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return undefined
    const record = item as Record<string, unknown>
    const origin = record.origin !== null && typeof record.origin === 'object' ? record.origin as Record<string, unknown> : undefined
    const size = record.size !== null && typeof record.size === 'object' ? record.size as Record<string, unknown> : undefined
    const x = origin === undefined ? record.x : origin.x
    const y = origin === undefined ? record.y : origin.y
    const w = size === undefined ? record.w : size.width
    const h = size === undefined ? record.h : size.height
    if (typeof x !== 'number' || typeof y !== 'number') return undefined
    if (typeof w !== 'number' || typeof h !== 'number') return undefined
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined
    if (!Number.isFinite(w) || !Number.isFinite(h)) return undefined
    if (w <= 0 || h <= 0) return undefined
    rects.push({ x, y, w, h })
  }
  return rects
}

function markPageSize(value: unknown): { width: number, height: number } | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const width = record.width
  const height = record.height
  if (typeof width !== 'number' || typeof height !== 'number') return undefined
  if (!Number.isFinite(width) || !Number.isFinite(height)) return undefined
  if (!(width > 0) || !(height > 0)) return undefined
  return { width, height }
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
    if (ref === '' || (quote === '' && kind !== 'visual')) return undefined
    if (kind !== 'highlight' && kind !== 'ask' && kind !== 'translate' && kind !== 'visual') return undefined
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) return undefined
    const body: MarkAddBody = { ref, kind, quote, page }
    if (typeof record.comment === 'string' && record.comment.trim() !== '') body.comment = record.comment
    if (typeof record.question === 'string' && record.question.trim() !== '') body.question = record.question
    if (typeof record.to === 'string' && record.to.trim() !== '') body.to = record.to.trim()
    if (typeof record.color === 'string' && record.color.trim() !== '') body.color = record.color.trim()
    const asset = record.asset
    if (asset !== null && typeof asset === 'object' && !Array.isArray(asset)) {
      const item = asset as Record<string, unknown>
      const mediaType = typeof item.mediaType === 'string' ? item.mediaType : ''
      const data = typeof item.data === 'string' ? item.data : ''
      if (mediaType !== '' && data !== '') body.asset = { mediaType, data }
    }
    const rects = markRects(record.rects)
    if (rects !== undefined) body.rects = rects
    const pageSize = markPageSize(record.pageSize)
    if (pageSize !== undefined) body.pageSize = pageSize
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
    const result = await readMarks(settings.vault, ref.trim())
    if (!result.ok) {
      sendJson(res, result.status, { error: result.error })
      return
    }
    sendJson(res, 200, { paperPath: result.paperPath, marks: result.marks })
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
  // A browser selection already knows its page rectangles, so the mark is
  // written here instead of re-locating the quote through the CLI. Translation
  // still needs the CLI's machine-translation engines.
  if (body.kind !== 'translate' && body.rects !== undefined && body.pageSize !== undefined) {
    const written = await writeMark(settings.vault, {
      ref: body.ref,
      kind: body.kind,
      quote: body.quote,
      page: body.page,
      rects: body.rects,
      pageSize: body.pageSize,
      ...(body.color === undefined ? {} : { color: body.color }),
      ...(body.comment === undefined ? {} : { comment: body.comment }),
      ...(body.question === undefined ? {} : { question: body.question }),
      ...(body.asset === undefined ? {} : { asset: body.asset }),
    })
    if (!written.ok) {
      sendJson(res, written.status, { error: written.error })
      return
    }
    sendJson(res, 200, { ok: true, ids: written.ids, path: written.path })
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
  if (body.color !== undefined) args.push('--mark-color', body.color)
  if (body.comment !== undefined) args.push('--comment', body.comment)
  if (body.question !== undefined) args.push('--question', body.question)
  if (body.to !== undefined) args.push('--to', body.to)
  const result = await runAgentero(settings.agenteroBin, args, MARK_ADD_TIMEOUT_MS, children)
  await finishCliJson(res, result, 'agentero mark add')
}

/** Serve one PNG crop stored under `<paper>/marks/assets`. */
async function handleMarkAsset(
  settings: Config,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('allow', 'GET, HEAD')
    res.end()
    return
  }
  if (!requireVault(settings, res)) return
  const rawPath = queryParam(req, 'path')
  const relative = (rawPath ?? '').trim().replaceAll('\\', '/')
  if (!/(^|\/)marks\/assets\/[^/]+\.png$/.test(relative)) {
    sendJson(res, 400, { error: 'invalid path' })
    return
  }
  const located = await locateVaultPath(settings.vault, relative)
  if (!located.ok) {
    sendJson(res, located.status, { error: located.error })
    return
  }
  let real: string
  try {
    real = await realpath(located.location.lexical)
  } catch {
    sendJson(res, 404, { error: 'not found' })
    return
  }
  if (!within(located.location.root, real, false)) {
    sendJson(res, 400, { error: 'invalid path' })
    return
  }
  const stat = await lstat(real)
  if (!stat.isFile()) {
    sendJson(res, 400, { error: 'invalid path' })
    return
  }
  res.statusCode = 200
  res.setHeader('content-type', 'image/png')
  res.setHeader('cache-control', 'no-store')
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  res.end(await readFile(real))
}

/** Translate text through the CLI's free machine translation engines. */
async function handleTranslate(
  settings: Config,
  req: IncomingMessage,
  res: ServerResponse,
  children: Set<ChildProcess>,
): Promise<void> {
  if (!requirePost(req, res) || !requireVault(settings, res)) return
  const body = await readObject(req, res)
  if (body === undefined) return
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (text === '' || text.length > 20_000) {
    sendJson(res, 400, { error: 'invalid body' })
    return
  }
  const requested = typeof body.to === 'string' ? body.to.trim() : ''
  const to = /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})?$/.test(requested) ? requested : 'zh-CN'
  const result = await runAgentero(
    settings.agenteroBin,
    ['--vault', settings.vault, '--json', 'translate', text, '--to', to],
    TRANSLATE_TIMEOUT_MS,
    children,
  )
  await finishCliJson(res, result, 'agentero translate')
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
): Promise<void> {
  if (!isLoopbackHost(req.headers.host)) {
    res.statusCode = 403
    res.end()
    return
  }
  if (await handleRecommendRequest(settings, req, res, children)) return
  const pathname = pathnameOf(req)
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
  if (pathname === PDF_BOOKMARKS_PATH) {
    await handlePdfBookmarks(settings, req, res)
    return
  }
  if (pathname === MARKS_PATH) {
    await handleMarks(settings, req, res, children)
    return
  }
  if (pathname === MARK_ASSET_PATH) {
    await handleMarkAsset(settings, req, res)
    return
  }
  if (pathname === TRANSLATE_PATH) {
    await handleTranslate(settings, req, res, children)
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
 * Schemastery lives in the harness workspace
 * (`@deepseek-ai/cosmokit` is `workspace:~`), so this entry applies the defaults
 * itself instead of importing that package.
 * @param ctx - Host plugin context.
 * @param config - Raw loader config. Missing fields use the defaults.
 */
export function apply(ctx: Context, config?: unknown): void {
  const settings = settingsFrom(config)
  const agents = (ctx as Context & { agents: AgentRegistryLike }).agents
  ctx.effect(() => {
    console.log('[agentero] plugin loaded')
    const children = new Set<ChildProcess>()
    const route: WebRoute = {
      kind: 'prefix',
      path: API_PREFIX,
      handler: (req, res) => handleApi(settings, agents, req, res, children).catch((error: unknown) => {
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
