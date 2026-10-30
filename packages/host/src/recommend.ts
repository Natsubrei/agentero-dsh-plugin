import type { ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { cliFailure, runAgentero } from './cli-run.js'

/**
 * arXiv daily + Zhihu recommendation routes.
 *
 * Configuration is read from the Agentero desktop `settings.json` first, then
 * from a small plugin-owned override file. Secrets never leave the host: the
 * settings response only reports whether a key or Access Secret is present.
 */

export interface RecommendHostSettings {
  vault: string
  agenteroBin: string
  /** Absolute path to Agentero's `settings.json`; empty resolves the XDG path. */
  agenteroSettings: string
}

interface OverrideSettings {
  embeddingBaseUrl?: string
  embeddingApiKey?: string
  embeddingModel?: string
  zhihuAccessSecret?: string
}

interface EmbeddingConfig {
  baseUrl: string
  apiKey?: string
  model: string
  source: 'agentero' | 'dsh'
}

interface RuntimeConfig {
  embedding?: EmbeddingConfig
  zhihuSecret?: string
  zhihuSource?: 'agentero' | 'dsh'
}

export interface RecommendSettingsView {
  vaultConfigured: boolean
  embedding: {
    configured: boolean
    baseUrl: string
    model: string
    keyPresent: boolean
    source: 'agentero' | 'dsh' | 'none'
  }
  zhihu: {
    configured: boolean
    source: 'agentero' | 'dsh' | 'none'
  }
}

interface Candidate {
  arxivId: string
  title: string
  abstract: string
  url: string
  publishedAt?: string
}

export interface ArxivRecommendItem extends Candidate {
  score: number
}

export interface ArxivRecommendResult {
  items: ArxivRecommendItem[]
  computedAt: string
  categories: string[]
  corpusSize: number
  reusedCache: boolean
}

export interface ZhihuSearchItem {
  kind: 'answer' | 'article'
  title: string
  url: string
  excerpt: string
  author: string
  votes: number
  score: number
}

const PREFIX = '/agentero/api/recommend'
const BODY_LIMIT = 128 * 1024
const FEED_TIMEOUT_MS = 30_000
const EMBED_TIMEOUT_MS = 120_000
const ZHIHU_TIMEOUT_MS = 20_000
const CLI_TIMEOUT_MS = 20_000
const EMBED_BATCH = 20
const EMBED_CHARS = 4_000
const MAX_CORPUS = 2_000
const MAX_TOP_N = 100
const DEFAULT_TOP_N = 20
const ZHIHU_SCORE_FLOOR = 0.5
const DEFAULT_CATEGORIES = ['cs.AI', 'cs.CL', 'cs.LG', 'cs.CV', 'stat.ML']
const ZHIHU_BASE = 'https://developer.zhihu.com'
const ARXIV_RSS_BASE = 'https://rss.arxiv.org/rss/'

interface CacheFile {
  runs: Record<string, { computedAt: string, result: ArxivRecommendResult }>
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function maskedSecret(value: string): boolean {
  return value !== '' && /^\*+$/.test(value)
}

function configHome(): string {
  const xdg = stringValue(process.env.XDG_CONFIG_HOME)
  if (xdg !== '') return xdg
  if (process.platform === 'win32') {
    const appData = stringValue(process.env.APPDATA)
    if (appData !== '') return appData
  }
  return join(homedir(), '.config')
}

function cacheHome(): string {
  const xdg = stringValue(process.env.XDG_CACHE_HOME)
  if (xdg !== '') return xdg
  if (process.platform === 'win32') {
    const local = stringValue(process.env.LOCALAPPDATA)
    if (local !== '') return local
  }
  return join(homedir(), '.cache')
}

function agenteroSettingsPath(settings: RecommendHostSettings): string {
  const explicit = settings.agenteroSettings.trim()
  return explicit !== '' ? explicit : join(configHome(), 'agentero', 'settings.json')
}

function overrideSettingsPath(): string {
  return join(configHome(), 'agentero', 'dsh-recommend.json')
}

function cacheFilePath(): string {
  return join(cacheHome(), 'agentero', 'dsh-recommend-cache.json')
}

async function readJsonFile(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const text = await readFile(path, 'utf8')
    return record(JSON.parse(text))
  } catch {
    return undefined
  }
}

async function writeSecureJson(path: string, value: unknown): Promise<void> {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
}

async function loadOverrides(): Promise<OverrideSettings> {
  const raw = await readJsonFile(overrideSettingsPath())
  if (raw === undefined) return {}
  const out: OverrideSettings = {}
  const baseUrl = stringValue(raw.embeddingBaseUrl)
  const apiKey = stringValue(raw.embeddingApiKey)
  const model = stringValue(raw.embeddingModel)
  const zhihu = stringValue(raw.zhihuAccessSecret)
  if (baseUrl !== '') out.embeddingBaseUrl = baseUrl
  if (apiKey !== '' && !maskedSecret(apiKey)) out.embeddingApiKey = apiKey
  if (model !== '') out.embeddingModel = model
  if (zhihu !== '' && !maskedSecret(zhihu)) out.zhihuAccessSecret = zhihu
  return out
}

async function resolveRuntime(settings: RecommendHostSettings): Promise<RuntimeConfig> {
  const agentero = await readJsonFile(agenteroSettingsPath(settings))
  const overrides = await loadOverrides()

  const agenteroEmbedding = record(agentero?.embedding)
  const agenteroSource = stringValue(agenteroEmbedding?.source)
  const agenteroIsBuiltin = agenteroSource === 'builtin'

  const agenteroBase = agenteroIsBuiltin ? '' : stringValue(agenteroEmbedding?.baseUrl)
  const agenteroModel = agenteroIsBuiltin ? '' : stringValue(agenteroEmbedding?.model)
  const agenteroKeyRaw = agenteroIsBuiltin ? '' : stringValue(agenteroEmbedding?.apiKey)
  const agenteroKey = maskedSecret(agenteroKeyRaw) ? '' : agenteroKeyRaw

  const overrideBase = overrides.embeddingBaseUrl ?? ''
  const overrideModel = overrides.embeddingModel ?? ''
  const overrideKey = overrides.embeddingApiKey ?? ''

  let baseUrl = ''
  let model = ''
  let key = ''
  let source: 'agentero' | 'dsh' = 'agentero'
  if (overrideBase !== '' || overrideModel !== '') {
    baseUrl = overrideBase !== '' ? overrideBase : agenteroBase
    model = overrideModel !== '' ? overrideModel : agenteroModel
    key = overrideKey !== '' ? overrideKey : agenteroKey
    source = 'dsh'
  } else {
    baseUrl = agenteroBase
    model = agenteroModel
    key = overrideKey !== '' ? overrideKey : agenteroKey
    source = overrideKey !== '' ? 'dsh' : 'agentero'
  }

  const embedding = baseUrl !== '' && model !== ''
    ? { baseUrl, model, source, ...(key !== '' ? { apiKey: key } : {}) }
    : undefined

  const agenteroZhihuRaw = stringValue(agentero?.zhihuAccessSecret)
  const agenteroZhihu = maskedSecret(agenteroZhihuRaw) ? '' : agenteroZhihuRaw
  const zhihuSecret = overrides.zhihuAccessSecret !== undefined && overrides.zhihuAccessSecret !== ''
    ? overrides.zhihuAccessSecret
    : agenteroZhihu

  return {
    ...(embedding !== undefined ? { embedding } : {}),
    ...(zhihuSecret !== '' ? { zhihuSecret, zhihuSource: overrides.zhihuAccessSecret !== undefined ? 'dsh' as const : 'agentero' as const } : {}),
  }
}

function settingsView(settings: RecommendHostSettings, runtime: RuntimeConfig): RecommendSettingsView {
  return {
    vaultConfigured: settings.vault.trim() !== '',
    embedding: {
      configured: runtime.embedding !== undefined,
      baseUrl: runtime.embedding?.baseUrl ?? '',
      model: runtime.embedding?.model ?? '',
      keyPresent: runtime.embedding?.apiKey !== undefined,
      source: runtime.embedding?.source ?? 'none',
    },
    zhihu: {
      configured: runtime.zhihuSecret !== undefined,
      source: runtime.zhihuSource ?? 'none',
    },
  }
}

async function saveOverrides(raw: Record<string, unknown>): Promise<void> {
  const current = await loadOverrides()
  const next: OverrideSettings = { ...current }
  const assign = (key: keyof OverrideSettings, value: unknown, allowMask: boolean): void => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (trimmed === '' || (allowMask && maskedSecret(trimmed))) return
    next[key] = trimmed
  }
  assign('embeddingBaseUrl', raw.embeddingBaseUrl, false)
  assign('embeddingModel', raw.embeddingModel, false)
  assign('embeddingApiKey', raw.embeddingApiKey, true)
  assign('zhihuAccessSecret', raw.zhihuAccessSecret, true)
  await writeSecureJson(overrideSettingsPath(), next)
}

async function readCache(): Promise<CacheFile> {
  const raw = await readJsonFile(cacheFilePath())
  const runs = record(raw?.runs)
  if (runs === undefined) return { runs: {} }
  const out: CacheFile['runs'] = {}
  for (const [key, value] of Object.entries(runs)) {
    const entry = record(value)
    const computedAt = stringValue(entry?.computedAt)
    const result = parseArxivResult(entry?.result)
    if (computedAt === '' || result === undefined) continue
    out[key] = { computedAt, result }
  }
  return { runs: out }
}

async function writeCache(cache: CacheFile): Promise<void> {
  const entries = Object.entries(cache.runs)
    .sort((a, b) => b[1].computedAt.localeCompare(a[1].computedAt))
    .slice(0, 24)
  await writeSecureJson(cacheFilePath(), { runs: Object.fromEntries(entries) })
}

function parseArxivResult(value: unknown): ArxivRecommendResult | undefined {
  const raw = record(value)
  if (raw === undefined) return undefined
  const itemsRaw = raw.items
  if (!Array.isArray(itemsRaw)) return undefined
  const items: ArxivRecommendItem[] = []
  for (const entry of itemsRaw) {
    const item = record(entry)
    if (item === undefined) continue
    const arxivId = stringValue(item.arxivId)
    const title = stringValue(item.title)
    const url = stringValue(item.url)
    if (arxivId === '' || title === '' || url === '') continue
    const score = typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : 0
    items.push({
      arxivId,
      title,
      abstract: stringValue(item.abstract),
      url,
      ...(stringValue(item.publishedAt) !== '' ? { publishedAt: stringValue(item.publishedAt) } : {}),
      score,
    })
  }
  const categories = Array.isArray(raw.categories)
    ? raw.categories.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    : []
  return {
    items,
    computedAt: stringValue(raw.computedAt),
    categories,
    corpusSize: typeof raw.corpusSize === 'number' && Number.isFinite(raw.corpusSize) ? raw.corpusSize : 0,
    reusedCache: raw.reusedCache === true,
  }
}

function normalizeCategories(input: unknown): string[] {
  const values = Array.isArray(input) ? input : []
  const out: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed === '' || trimmed.length > 40) continue
    if (!out.some(category => category.toLowerCase() === trimmed.toLowerCase())) out.push(trimmed)
  }
  return out
}

function topNFrom(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : DEFAULT_TOP_N
  return Math.min(MAX_TOP_N, Math.max(1, n))
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

function fresh(result: ArxivRecommendResult): boolean {
  return result.items.length > 0 && result.computedAt.startsWith(todayUtc())
}

function runKey(model: string, categories: string[], topN: number): string {
  const normalized = categories.map(category => category.toLowerCase()).join(',')
  return createHash('sha256').update(`arxiv|${model}|${topN}|${normalized}`).digest('hex')
}

function latestSameDay(cache: CacheFile): ArxivRecommendResult | undefined {
  const entries = Object.values(cache.runs).sort((a, b) => b.computedAt.localeCompare(a.computedAt))
  const latest = entries[0]
  return latest !== undefined && fresh(latest.result) ? latest.result : undefined
}

function decodeXml(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function itemTag(item: string, name: string): string {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(item)
  return match?.[1] !== undefined ? decodeXml(match[1]) : ''
}

function itemLink(item: string): string {
  const text = itemTag(item, 'link').trim()
  if (text !== '') return text
  const match = /<link\b[^>]*\bhref=(?:"([^"]*)"|'([^']*)')/i.exec(item)
  return decodeXml(match?.[1] ?? match?.[2] ?? '').trim()
}

function cleanAbstract(input: string): string {
  let text = stripHtml(decodeXml(input))
  const labels = ['arxiv:', 'announce type:', 'comments:', 'subjects:', 'journal-ref:', 'report-no:', 'abstract:']
  for (let changed = true; changed;) {
    changed = false
    for (const label of labels) {
      if (text.toLowerCase().startsWith(label)) {
        text = text.slice(label.length).trim()
        changed = true
      }
    }
  }
  return text
}

function arxivIdFrom(text: string): string {
  const match = /(?:arxiv\.org\/(?:abs|pdf|html)\/|arxiv:)([a-z-]+(?:\.[a-z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?/i.exec(text)
  if (match?.[1] !== undefined) return match[1]
  return ''
}

function parseFeed(xml: string): Candidate[] {
  const out: Candidate[] = []
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? []
  for (const item of items) {
    const title = stripHtml(itemTag(item, 'title'))
    const description = itemTag(item, 'description')
    const link = itemLink(item)
    const abstract = cleanAbstract(description)
    if (title === '' || abstract === '') continue
    const arxivId = arxivIdFrom(`${link}\n${description}\n${itemTag(item, 'guid')}`)
    if (arxivId === '') continue
    const published = itemTag(item, 'pubDate').trim()
    out.push({
      arxivId,
      title,
      abstract,
      url: `https://arxiv.org/abs/${arxivId}`,
      ...(published !== '' ? { publishedAt: published } : {}),
    })
  }
  return out
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const response = await fetch(url, {
    headers: { 'user-agent': 'Agentero/1.0 (+https://github.com/Phil-Fan)' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return response.text()
}

async function fetchCandidates(categories: string[]): Promise<Candidate[]> {
  const out: Candidate[] = []
  const seen = new Set<string>()
  let lastError: Error | undefined
  for (const category of categories) {
    try {
      const xml = await fetchText(`${ARXIV_RSS_BASE}${encodeURIComponent(category)}`, FEED_TIMEOUT_MS)
      for (const candidate of parseFeed(xml)) {
        if (seen.has(candidate.arxivId)) continue
        seen.add(candidate.arxivId)
        out.push(candidate)
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }
  if (out.length === 0 && lastError !== undefined) throw lastError
  return out
}

function resolveEmbeddingEndpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  if (base === '') return ''
  return base.endsWith('/embeddings') ? base : `${base}/embeddings`
}

function embedText(title: string, abstract: string): string {
  return `${title.trim()}\n\n${abstract.trim()}`.slice(0, EMBED_CHARS)
}

function normalizeVector(vector: number[]): number[] {
  let sum = 0
  for (const value of vector) sum += value * value
  const norm = Math.sqrt(sum)
  return norm > 0 ? vector.map(value => value / norm) : vector
}

function dot(left: number[], right: number[]): number {
  if (left.length !== right.length) return 0
  let sum = 0
  for (let index = 0; index < left.length; index += 1) sum += (left[index] ?? 0) * (right[index] ?? 0)
  return sum
}

async function embedBatch(
  endpoint: string,
  apiKey: string | undefined,
  model: string,
  texts: string[],
): Promise<number[][]> {
  if (texts.length === 0) return []
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (apiKey !== undefined) headers.authorization = `Bearer ${apiKey}`
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    })
  } catch (error) {
    throw new Error(`embeddings request failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    if (texts.length > 1 && (response.status === 400 || response.status === 413 || response.status === 422)) {
      const middle = Math.ceil(texts.length / 2)
      const left = await embedBatch(endpoint, apiKey, model, texts.slice(0, middle))
      const right = await embedBatch(endpoint, apiKey, model, texts.slice(middle))
      return [...left, ...right]
    }
    throw new Error(`embeddings HTTP ${response.status}: ${body.slice(0, 300)}`)
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('embeddings returned invalid JSON')
  }
  const data = record(body)?.data
  if (!Array.isArray(data)) throw new Error('embeddings response has no data')
  const vectors: number[][] = []
  for (const entry of data) {
    const row = record(entry)
    const vector = row?.embedding
    if (!Array.isArray(vector)) throw new Error('embeddings response has no vector')
    const values: number[] = []
    for (const value of vector) {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('embeddings response has an invalid vector')
      values.push(value)
    }
    vectors.push(values)
  }
  if (vectors.length !== texts.length) throw new Error(`embeddings returned ${vectors.length} vectors for ${texts.length} inputs`)
  return vectors
}

async function embedAll(
  endpoint: string,
  apiKey: string | undefined,
  model: string,
  texts: string[],
): Promise<number[][]> {
  const out: number[][] = []
  for (let start = 0; start < texts.length; start += EMBED_BATCH) {
    const chunk = texts.slice(start, start + EMBED_BATCH)
    out.push(...await embedBatch(endpoint, apiKey, model, chunk))
  }
  return out
}

async function corpusTexts(settings: RecommendHostSettings, children: Set<ChildProcess>): Promise<string[]> {
  const result = await runAgentero(settings.agenteroBin, [
    '--vault', settings.vault,
    '--json',
    'paper', 'list',
    '--fields', 'abstract,added_at',
  ], CLI_TIMEOUT_MS, children)
  if (result.timedOut || result.spawnError !== undefined || result.code !== 0) {
    throw new Error(cliFailure(result, 'agentero paper list'))
  }
  let body: unknown
  try {
    body = JSON.parse(result.stdout)
  } catch {
    throw new Error('agentero paper list returned invalid JSON')
  }
  const root = record(body)
  const data = Array.isArray(root?.data) ? root.data : Array.isArray(root?.items) ? root.items : []
  const rows: { addedAt: string, text: string }[] = []
  for (const entry of data) {
    const row = record(entry)
    if (row === undefined) continue
    const title = stringValue(row.title)
    const abstract = stringValue(row.abstract)
    if (title === '' || abstract === '') continue
    rows.push({ addedAt: stringValue(row.added_at), text: embedText(title, abstract) })
  }
  rows.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  return rows.slice(0, MAX_CORPUS).map(row => row.text)
}

function decayWeights(length: number): number[] {
  const raw: number[] = []
  for (let index = 0; index < length; index += 1) raw.push(1 / (1 + Math.log10(index + 2)))
  const total = raw.reduce((sum, value) => sum + value, 0)
  return total > 0 ? raw.map(value => value / total) : raw.map(() => 0)
}

async function recommendArxiv(
  settings: RecommendHostSettings,
  runtime: RuntimeConfig,
  input: Record<string, unknown>,
  children: Set<ChildProcess>,
): Promise<ArxivRecommendResult> {
  if (settings.vault.trim() === '') throw new Error('vault is not configured')
  const categories = normalizeCategories(input.categories)
  const resolvedCategories = categories.length > 0 ? categories : [...DEFAULT_CATEGORIES]
  const topN = topNFrom(input.topN)
  const force = input.force === true
  const cache = await readCache()

  if (runtime.embedding === undefined) {
    const stored = latestSameDay(cache)
    if (!force && stored !== undefined) return { ...stored, reusedCache: true }
    throw new Error('recommend.no_embedding')
  }

  const key = runKey(runtime.embedding.model, resolvedCategories, topN)
  const cached = cache.runs[key]
  if (!force && cached !== undefined && fresh(cached.result)) return { ...cached.result, reusedCache: true }

  const corpus = await corpusTexts(settings, children)
  if (corpus.length === 0) throw new Error('recommend.empty_corpus')
  const candidates = await fetchCandidates(resolvedCategories)
  if (candidates.length === 0) throw new Error('recommend.no_candidates')

  const endpoint = resolveEmbeddingEndpoint(runtime.embedding.baseUrl)
  if (endpoint === '') throw new Error('recommend.no_embedding')

  const corpusVectors = (await embedAll(endpoint, runtime.embedding.apiKey, runtime.embedding.model, corpus))
    .map(normalizeVector)
  const candidateVectors = (await embedAll(
    endpoint,
    runtime.embedding.apiKey,
    runtime.embedding.model,
    candidates.map(candidate => embedText(candidate.title, candidate.abstract)),
  )).map(normalizeVector)

  const weights = decayWeights(corpusVectors.length)
  const items = candidates.map((candidate, index) => {
    const candidateVector = candidateVectors[index] ?? []
    let score = 0
    for (let corpusIndex = 0; corpusIndex < corpusVectors.length; corpusIndex += 1) {
      const weight = weights[corpusIndex] ?? 0
      score += dot(corpusVectors[corpusIndex] ?? [], candidateVector) * weight
    }
    return { ...candidate, score }
  })
  items.sort((left, right) => right.score - left.score)
  const result: ArxivRecommendResult = {
    items: items.slice(0, topN),
    computedAt: new Date().toISOString(),
    categories: resolvedCategories,
    corpusSize: corpusVectors.length,
    reusedCache: false,
  }
  cache.runs[key] = { computedAt: result.computedAt, result }
  await writeCache(cache)
  return result
}

async function probeEmbedding(
  runtime: RuntimeConfig,
  input: Record<string, unknown>,
): Promise<{ dim: number, latencyMs: number }> {
  const overrideBase = stringValue(input.baseUrl)
  const overrideModel = stringValue(input.model)
  const rawKey = stringValue(input.apiKey)
  const baseUrl = overrideBase !== '' ? overrideBase : runtime.embedding?.baseUrl ?? ''
  const model = overrideModel !== '' ? overrideModel : runtime.embedding?.model ?? ''
  const apiKey = rawKey !== '' && !maskedSecret(rawKey) ? rawKey : runtime.embedding?.apiKey
  if (baseUrl === '' || model === '') throw new Error('recommend.no_embedding')
  const endpoint = resolveEmbeddingEndpoint(baseUrl)
  const started = Date.now()
  try {
    const vectors = await embedBatch(endpoint, apiKey, model, ['hi'])
    const vector = vectors[0] ?? []
    if (vector.length === 0) throw new Error('response has no embedding')
    return { dim: vector.length, latencyMs: Date.now() - started }
  } catch (error) {
    console.warn('[agentero] embedding probe failed:', error)
    throw new Error('recommend.probe_failed')
  }
}

function parseZhihuItems(body: unknown): ZhihuSearchItem[] {
  const root = record(body)
  const code = typeof root?.Code === 'number' ? root.Code : 0
  if (code !== 0) {
    const message = stringValue(root?.Message)
    throw new Error(message !== '' ? message : '知乎检索失败')
  }
  const data = record(root?.Data)
  const items = Array.isArray(data?.Items) ? data.Items : []
  const out: ZhihuSearchItem[] = []
  for (const raw of items) {
    const item = record(raw)
    if (item === undefined) continue
    const title = stringValue(item.Title).replace(/\s*-\s*知乎$/, '')
    const url = stringValue(item.Url).split('?')[0] ?? ''
    if (title === '' || url === '') continue
    const score = typeof item.RankingScore === 'number' && Number.isFinite(item.RankingScore) ? item.RankingScore : 0
    if (score < ZHIHU_SCORE_FLOOR) continue
    const contentType = stringValue(item.ContentType).toLowerCase()
    out.push({
      kind: contentType === 'answer' ? 'answer' : 'article',
      title,
      url,
      excerpt: [...stringValue(item.ContentText)].slice(0, 160).join(''),
      author: stringValue(item.AuthorName),
      votes: typeof item.VoteUpCount === 'number' && Number.isFinite(item.VoteUpCount) ? item.VoteUpCount : 0,
      score,
    })
  }
  return out
}

async function searchZhihu(runtime: RuntimeConfig, query: string, count: number): Promise<ZhihuSearchItem[]> {
  if (runtime.zhihuSecret === undefined) throw new Error('zhihu.no_secret')
  const trimmed = query.trim()
  if (trimmed === '') throw new Error('zhihu.empty_query')
  const url = new URL(`${ZHIHU_BASE}/api/v1/content/zhihu_search`)
  url.searchParams.set('Query', trimmed)
  url.searchParams.set('Count', String(Math.min(10, Math.max(1, count))))
  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        authorization: `Bearer ${runtime.zhihuSecret}`,
        'x-request-timestamp': String(Math.floor(Date.now() / 1000)),
      },
      signal: AbortSignal.timeout(ZHIHU_TIMEOUT_MS),
    })
  } catch (error) {
    throw new Error(`知乎检索请求失败：${error instanceof Error ? error.message : String(error)}`)
  }
  const text = await response.text()
  if (!response.ok) throw new Error(`知乎检索 HTTP ${response.status}: ${text.slice(0, 300)}`)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error('知乎检索响应解析失败')
  }
  return parseZhihuItems(body)
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const declared = req.headers['content-length']
  if (declared !== undefined) {
    const length = Number(declared)
    if (!Number.isFinite(length) || length > BODY_LIMIT) return Promise.resolve(undefined)
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
    const finish = (value: Record<string, unknown> | undefined, error?: unknown): void => {
      if (settled) return
      settled = true
      cleanup()
      if (error !== undefined) reject(error instanceof Error ? error : new Error(String(error)))
      else resolve(value)
    }
    const onData = (chunk: Buffer | string): void => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > BODY_LIMIT) {
        finish(undefined)
        return
      }
      chunks.push(buffer)
    }
    const onEnd = (): void => {
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (text === '') {
        finish({})
        return
      }
      try {
        finish(record(JSON.parse(text)))
      } catch {
        finish(undefined)
      }
    }
    const onError = (error: Error): void => { finish(undefined, error) }
    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onError)
  })
}

function statusFor(error: Error): number {
  const message = error.message
  if (message === 'invalid body') return 400
  if (message === 'vault is not configured') return 503
  return 502
}

/**
 * Handle `/agentero/api/recommend/*`. Returns false when the path is outside
 * this prefix so the caller can continue routing.
 */
export async function handleRecommendRequest(
  settings: RecommendHostSettings,
  req: IncomingMessage,
  res: ServerResponse,
  children: Set<ChildProcess>,
): Promise<boolean> {
  let url: URL
  try {
    url = new URL(req.url ?? '/', 'http://127.0.0.1')
  } catch {
    return false
  }
  if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false
  const route = url.pathname.slice(PREFIX.length) || '/'

  try {
    if (route === '/settings') {
      if (req.method === 'GET') {
        sendJson(res, 200, settingsView(settings, await resolveRuntime(settings)))
        return true
      }
      if (req.method === 'PUT') {
        const body = await readJsonBody(req)
        if (body === undefined) {
          sendJson(res, 400, { error: 'invalid body' })
          return true
        }
        await saveOverrides(body)
        sendJson(res, 200, settingsView(settings, await resolveRuntime(settings)))
        return true
      }
      res.statusCode = 405
      res.setHeader('allow', 'GET, PUT')
      res.end()
      return true
    }

    if (route === '/probe') {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.setHeader('allow', 'POST')
        res.end()
        return true
      }
      const body = await readJsonBody(req)
      if (body === undefined) {
        sendJson(res, 400, { error: 'invalid body' })
        return true
      }
      sendJson(res, 200, await probeEmbedding(await resolveRuntime(settings), body))
      return true
    }

    if (route === '/arxiv') {
      if (req.method === 'GET') {
        const cache = await readCache()
        sendJson(res, 200, { result: latestSameDay(cache) ?? null })
        return true
      }
      if (req.method === 'POST') {
        const body = await readJsonBody(req)
        if (body === undefined) {
          sendJson(res, 400, { error: 'invalid body' })
          return true
        }
        sendJson(res, 200, await recommendArxiv(settings, await resolveRuntime(settings), body, children))
        return true
      }
      res.statusCode = 405
      res.setHeader('allow', 'GET, POST')
      res.end()
      return true
    }

    if (route === '/zhihu') {
      if (req.method !== 'GET') {
        res.statusCode = 405
        res.setHeader('allow', 'GET')
        res.end()
        return true
      }
      const query = stringValue(url.searchParams.get('query'))
      const countRaw = Number(url.searchParams.get('count') ?? '10')
      const count = Number.isFinite(countRaw) ? countRaw : 10
      sendJson(res, 200, { items: await searchZhihu(await resolveRuntime(settings), query, count) })
      return true
    }

    sendJson(res, 404, { error: 'not found' })
    return true
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error))
    if (!res.headersSent) sendJson(res, statusFor(failure), { error: failure.message })
    return true
  }
}
