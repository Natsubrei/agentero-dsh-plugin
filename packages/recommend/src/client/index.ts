import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { RecommendDock } from './recommend-dock'
import {
  arxivFrom,
  errorText,
  probeFrom,
  settingsFrom,
  zhihuFrom,
  type ArxivRecommendResult,
  type ProbeResult,
  type RecommendFace,
  type SettingsPatch,
  type SettingsView,
  type ZhihuSearchItem,
} from './types'

/** List entry identity inside the composer dock. */
const DOCK_ID = 'agentero-dsh-recommend'

const NS = 'agentero.recommend'

const zh = {
  title: '推荐',
  arxivTab: 'arXiv 每日',
  zhihuTab: '知乎',
  refresh: '重新计算推荐',
  computing: '正在生成今日推荐…',
  probing: '正在检查 Embedding 服务…',
  addCategory: '添加分类',
  categoryPlaceholder: '例如 cs.RO',
  removeCategory: '移除分类 {category}',
  categories: 'arXiv 分类',
  expand: '展开推荐',
  collapse: '收起推荐',
  settings: '设置',
  settingsDescription: '留空表示继续使用 Agentero 桌面端已经保存的配置。',
  baseUrl: 'Embedding Base URL',
  apiKey: 'Embedding API Key',
  model: 'Embedding 模型',
  zhihuSecret: '知乎 Access Secret',
  save: '保存',
  saving: '保存中…',
  saved: '已保存',
  keyConfigured: '已配置',
  keyMissing: '未配置',
  secretConfigured: '已配置',
  secretMissing: '未配置',
  keepBlank: '留空保持不变',
  close: '关闭',
  idle: '还没有今日推荐。点刷新，把当天 arXiv 新论文与论文库排序。',
  needsEmbedding: '请先配置 Embedding 模型——推荐需要把新论文摘要与你的论文库比对。',
  probeFailed: 'Embedding 服务没有响应。请检查地址、密钥和模型后重试。',
  needsCorpus: '论文库里还没有带摘要的论文，暂时无法排序。',
  noCandidates: '今天的 arXiv 源没有取到可用论文，稍后再试。',
  retry: '重试',
  openSettings: '打开设置',
  updatedAt: '更新于 {time}',
  corpusCount: '论文库 {count} 篇',
  import: '导入',
  imported: '已导入',
  importing: '导入中…',
  open: '打开',
  actionFailed: '操作失败',
  vaultMissing: '尚未配置 Vault',
  zhihuSearchPlaceholder: '论文标题或关键词',
  zhihuSearch: '检索',
  zhihuNote: '按关键词检索知乎，结果可能与当前论文无关。',
  zhihuEmpty: '没有找到相关讨论。',
  zhihuLoading: '正在检索知乎…',
  zhihuRefresh: '换一批',
  answer: '回答',
  article: '文章',
  votes: '{votes} 赞同',
  zhihuNoSecret: '尚未配置知乎 Access Secret。请在设置中填入。',
  zhihuEmptyQuery: '请输入检索关键词。',
  zhihuHint: '输入论文标题或关键词，看看知乎上大家在讨论什么。',
}

const en = {
  title: 'Recommend',
  arxivTab: 'arXiv daily',
  zhihuTab: 'Zhihu',
  refresh: 'Recompute recommendations',
  computing: 'Building today’s recommendations…',
  probing: 'Checking the embedding service…',
  addCategory: 'Add category',
  categoryPlaceholder: 'e.g. cs.RO',
  removeCategory: 'Remove {category}',
  categories: 'arXiv categories',
  expand: 'Expand recommendations',
  collapse: 'Collapse recommendations',
  settings: 'Settings',
  settingsDescription: 'Leave a field blank to keep using the value saved in the Agentero desktop app.',
  baseUrl: 'Embedding base URL',
  apiKey: 'Embedding API key',
  model: 'Embedding model',
  zhihuSecret: 'Zhihu Access Secret',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  keyConfigured: 'configured',
  keyMissing: 'not configured',
  secretConfigured: 'configured',
  secretMissing: 'not configured',
  keepBlank: 'Leave blank to keep it',
  close: 'Close',
  idle: 'No recommendations yet. Refresh to rank today’s arXiv papers against your library.',
  needsEmbedding: 'Configure an embedding model first. Recommendations compare new abstracts with your library.',
  probeFailed: 'The embedding service did not respond. Check the URL, key, and model, then retry.',
  needsCorpus: 'The library has no papers with abstracts to compare against yet.',
  noCandidates: 'The arXiv feeds returned no usable papers today. Try again later.',
  retry: 'Retry',
  openSettings: 'Open settings',
  updatedAt: 'Updated {time}',
  corpusCount: '{count} library papers',
  import: 'Import',
  imported: 'Imported',
  importing: 'Importing…',
  open: 'Open',
  actionFailed: 'Action failed',
  vaultMissing: 'Vault is not configured',
  zhihuSearchPlaceholder: 'Paper title or keyword',
  zhihuSearch: 'Search',
  zhihuNote: 'Search is keyword-based; results may not discuss the current paper.',
  zhihuEmpty: 'No related discussions found.',
  zhihuLoading: 'Searching Zhihu…',
  zhihuRefresh: 'Refresh',
  answer: 'Answer',
  article: 'Article',
  votes: '{votes} upvotes',
  zhihuNoSecret: 'No Zhihu Access Secret is configured. Add one in settings.',
  zhihuEmptyQuery: 'Enter a search keyword.',
  zhihuHint: 'Type a paper title or keyword to see what people discuss on Zhihu.',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Recommendation dock copy. */
    'agentero.recommend': keyof typeof zh
  }

}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`/agentero/api/recommend${path}`, { cache: 'no-store', ...init })
  const text = await response.text()
  let body: unknown
  try {
    body = text.trim() === '' ? undefined : JSON.parse(text) as unknown
  } catch {
    throw new Error(response.ok ? 'invalid recommend response' : '')
  }
  if (!response.ok) throw new Error(errorText(body) ?? '')
  return body
}

/** Browser plugin name. */
export const name = 'agentero-recommend'

/** Slot and locale services. The dock renders inside the composer stack. */
export const inject = ['slots', 'locale']

/**
 * Dock the recommendation strip under the conversation composer.
 * arXiv daily and Zhihu share one surface so neither takes a sidebar page.
 * @param ctx - Browser plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }))
  const face: RecommendFace = {
    async loadSettings(): Promise<SettingsView> {
      return settingsFrom(await request('/settings'))
    },
    async saveSettings(patch: SettingsPatch): Promise<SettingsView> {
      return settingsFrom(await request('/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      }))
    },
    async probeEmbedding(): Promise<ProbeResult> {
      return probeFrom(await request('/probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }))
    },
    async loadArxiv(categories: string[]): Promise<ArxivRecommendResult | null> {
      const params = new URLSearchParams({ categories: categories.join(',') })
      return arxivFrom(await request(`/arxiv?${params.toString()}`))
    },
    async recommendArxiv(categories: string[]): Promise<ArxivRecommendResult> {
      const result = arxivFrom(await request('/arxiv', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ categories, topN: 20, force: true }),
      }))
      if (result === null) throw new Error('invalid recommend response')
      return result
    },
    async searchZhihu(query: string, count = 10): Promise<ZhihuSearchItem[]> {
      const params = new URLSearchParams({ query, count: String(count) })
      return zhihuFrom(await request(`/zhihu?${params.toString()}`))
    },
    async importPaper(text: string): Promise<void> {
      const response = await fetch('/agentero/api/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        cache: 'no-store',
      })
      const body: unknown = await response.json().catch(() => undefined)
      if (!response.ok) throw new Error(errorText(body) ?? '')
    },
  }
  ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: DOCK_ID,
    order: 60,
    locale: NS,
    inject: () => face,
  }, RecommendDock)))
}
