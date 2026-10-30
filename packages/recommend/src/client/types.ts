import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

export type RecommendT = PropsLocale<'agentero.recommend'>['t']

export interface EmbeddingSettingsView {
  configured: boolean
  baseUrl: string
  model: string
  keyPresent: boolean
  source: 'agentero' | 'dsh' | 'none'
}

export interface SettingsView {
  vaultConfigured: boolean
  embedding: EmbeddingSettingsView
  zhihu: {
    configured: boolean
    source: 'agentero' | 'dsh' | 'none'
  }
}

export interface ArxivRecommendItem {
  arxivId: string
  title: string
  abstract: string
  url: string
  publishedAt?: string
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

export interface ProbeResult {
  dim: number
  latencyMs: number
}

export interface SettingsPatch {
  embeddingBaseUrl?: string
  embeddingApiKey?: string
  embeddingModel?: string
  zhihuAccessSecret?: string
}

export interface RecommendFace {
  loadSettings(): Promise<SettingsView>
  saveSettings(patch: SettingsPatch): Promise<SettingsView>
  probeEmbedding(): Promise<ProbeResult>
  loadArxiv(categories: string[]): Promise<ArxivRecommendResult | null>
  recommendArxiv(categories: string[]): Promise<ArxivRecommendResult>
  searchZhihu(query: string, count?: number): Promise<ZhihuSearchItem[]>
  importPaper(text: string): Promise<void>
}

export function errorText(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object' || !('error' in body)) return undefined
  const error = body.error
  if (typeof error === 'string' && error.trim() !== '') return error
  if (error !== null && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return undefined
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function sourceValue(value: unknown): 'agentero' | 'dsh' | 'none' {
  return value === 'agentero' || value === 'dsh' ? value : 'none'
}

export function settingsFrom(body: unknown): SettingsView {
  const root = record(body)
  const embedding = record(root?.embedding)
  const zhihu = record(root?.zhihu)
  if (root === undefined || embedding === undefined || zhihu === undefined) {
    throw new Error('invalid recommend settings')
  }
  return {
    vaultConfigured: root.vaultConfigured === true,
    embedding: {
      configured: embedding.configured === true,
      baseUrl: stringValue(embedding.baseUrl),
      model: stringValue(embedding.model),
      keyPresent: embedding.keyPresent === true,
      source: sourceValue(embedding.source),
    },
    zhihu: {
      configured: zhihu.configured === true,
      source: sourceValue(zhihu.source),
    },
  }
}

export function arxivFrom(body: unknown): ArxivRecommendResult | null {
  const root = record(body)
  const result = record(root?.result)
  if (result === undefined) return null
  const itemsRaw = Array.isArray(result.items) ? result.items : []
  const items: ArxivRecommendItem[] = []
  for (const entry of itemsRaw) {
    const item = record(entry)
    if (item === undefined) continue
    const arxivId = stringValue(item.arxivId)
    const title = stringValue(item.title)
    const url = stringValue(item.url)
    if (arxivId === '' || title === '' || url === '') continue
    items.push({
      arxivId,
      title,
      abstract: stringValue(item.abstract),
      url,
      ...(stringValue(item.publishedAt) !== '' ? { publishedAt: stringValue(item.publishedAt) } : {}),
      score: typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : 0,
    })
  }
  return {
    items,
    computedAt: stringValue(result.computedAt),
    categories: Array.isArray(result.categories)
      ? result.categories.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
      : [],
    corpusSize: typeof result.corpusSize === 'number' && Number.isFinite(result.corpusSize) ? result.corpusSize : 0,
    reusedCache: result.reusedCache === true,
  }
}

export function zhihuFrom(body: unknown): ZhihuSearchItem[] {
  const root = record(body)
  const itemsRaw = root?.items
  if (!Array.isArray(itemsRaw)) throw new Error('invalid zhihu response')
  const out: ZhihuSearchItem[] = []
  for (const entry of itemsRaw) {
    const item = record(entry)
    if (item === undefined) continue
    const title = stringValue(item.title)
    const url = stringValue(item.url)
    if (title === '' || url === '') continue
    out.push({
      kind: item.kind === 'answer' ? 'answer' : 'article',
      title,
      url,
      excerpt: stringValue(item.excerpt),
      author: stringValue(item.author),
      votes: typeof item.votes === 'number' && Number.isFinite(item.votes) ? item.votes : 0,
      score: typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : 0,
    })
  }
  return out
}

export function probeFrom(body: unknown): ProbeResult {
  const root = record(body)
  const dim = root?.dim
  const latencyMs = root?.latencyMs
  if (typeof dim !== 'number' || !Number.isFinite(dim) || typeof latencyMs !== 'number' || !Number.isFinite(latencyMs)) {
    throw new Error('invalid probe response')
  }
  return { dim, latencyMs }
}

export function reasonOf(message: string): 'noEmbedding' | 'probeFailed' | 'emptyCorpus' | 'noCandidates' | 'noSecret' | 'emptyQuery' | 'other' {
  if (message === 'recommend.no_embedding') return 'noEmbedding'
  if (message === 'recommend.probe_failed') return 'probeFailed'
  if (message === 'recommend.empty_corpus') return 'emptyCorpus'
  if (message === 'recommend.no_candidates') return 'noCandidates'
  if (message === 'zhihu.no_secret') return 'noSecret'
  if (message === 'zhihu.empty_query') return 'emptyQuery'
  return 'other'
}

export function shown(message: string, t: RecommendT): string {
  const reason = reasonOf(message)
  if (reason === 'noEmbedding') return t('needsEmbedding')
  if (reason === 'probeFailed') return t('probeFailed')
  if (reason === 'emptyCorpus') return t('needsCorpus')
  if (reason === 'noCandidates') return t('noCandidates')
  if (reason === 'noSecret') return t('zhihuNoSecret')
  if (reason === 'emptyQuery') return t('zhihuEmptyQuery')
  if (message === 'vault is not configured') return t('vaultMissing')
  if (message === '') return t('actionFailed')
  return message
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
