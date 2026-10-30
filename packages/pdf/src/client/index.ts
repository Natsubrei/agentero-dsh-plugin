import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { en, zh } from './locale'
import { pdfChatActions } from './chat-actions'
import { normalizeHighlightColor } from './palette'
import { PdfPanel, PdfTitle, type PaintMark, type PdfInjected } from './pdf-panel'

/** Right-sidebar tab identity. The body registers under this key. */
const TAB_ID = 'agentero-dsh-pdf'

/** One PDF page per pane. Opening again focuses it and replaces the paper. */
const TAB_KIND = 'agentero.pdf'

const NS = 'agentero.pdf'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Opener registry from the host browser plugin. */
    agentero: {
      registerOpener(kind: 'paper' | 'note', opener: (id: string) => void): () => void
      request(url: string, init?: RequestInit): Promise<Response>
      getVault(): Promise<{ scope: string }>
    }
  }
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    /** Paper directory passed when the library opens this page. */
    'agentero.pdf': { readonly ref?: string }
  }
}

function errorText(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object' || !('error' in body)) return undefined
  const error = body.error
  if (typeof error === 'string' && error.trim() !== '') return error
  if (error !== null && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return undefined
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.trim() === '') return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function envelopeData(body: unknown): Record<string, unknown> | undefined {
  const record = recordOf(body)
  if (record === undefined) return undefined
  return recordOf(record.data) ?? record
}

function markRect(value: unknown): { x: number, y: number, w: number, h: number } | undefined {
  const record = recordOf(value)
  if (record === undefined) return undefined
  const { x, y, w, h } = record
  if (typeof x !== 'number' || typeof y !== 'number' || typeof w !== 'number' || typeof h !== 'number') return undefined
  if (w <= 0 || h <= 0) return undefined
  return { x, y, w, h }
}

/** One mark as the host reads it off disk (`/agentero/api/marks`). */
function markFromWire(value: unknown, scope: string): PaintMark | undefined {
  const record = recordOf(value)
  if (record === undefined) return undefined
  const id = typeof record.id === 'string' ? record.id : ''
  const kind = typeof record.kind === 'string' ? record.kind : ''
  const page = typeof record.page === 'number' ? record.page : 0
  if (id === '' || kind === '' || page < 1) return undefined
  const rawRects = Array.isArray(record.rects) ? record.rects : []
  const rects = rawRects
    .map(markRect)
    .filter((rect): rect is { x: number, y: number, w: number, h: number } => rect !== undefined)
  const note = typeof record.note === 'string' ? record.note : ''
  const space = record.space === 'pt' ? 'pt' : 'norm'
  const asset = typeof record.asset === 'string' && record.asset !== ''
    ? `/agentero/api/marks/asset?${new URLSearchParams({ path: record.asset, scope }).toString()}`
    : undefined
  const color = kind === 'highlight' && typeof record.color === 'string'
    ? normalizeHighlightColor(record.color)
    : undefined
  return { id, kind, page, rects, space, note, ...(asset === undefined ? {} : { asset }), ...(color === undefined ? {} : { color }) }
}

function translationOf(body: unknown): string | undefined {
  const data = envelopeData(body)
  const marks = data?.marks
  if (!Array.isArray(marks)) return undefined
  for (const mark of marks) {
    const record = recordOf(mark)
    if (typeof record?.result === 'string' && record.result.trim() !== '') return record.result
  }
  return undefined
}

/** Browser plugin name. */
export const name = 'agentero-pdf'

/** Slot services, the opener registry, and the session's right sidebar. */
export const inject = ['slots', 'locale', 'agentero', 'sidebarRight', 'sidebarRightTabs', 'sessions', 'conversation']

/**
 * Register the PDF page in the session's right sidebar and the paper opener.
 * The library still calls `agentero.open`. This opener focuses the one PDF tab.
 * @param ctx - Browser plugin context.
 */
export function apply(ctx: Context): void {
  const source = ctx.agentero
  const request = source.request.bind(source)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }))
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB_ID,
    kind: TAB_KIND,
    keepMounted: true,
    title: () => t('title'),
  }))
  ctx.effect(() => ctx.agentero.registerOpener('paper', (id) => {
    ctx.sidebarRight.openTab(TAB_KIND, { params: { ref: id } })
  }))

  const face: Omit<PdfInjected, 'ask'> = {
    async loadPdf(ref) {
      const response = await request(`/agentero/api/pdf?ref=${encodeURIComponent(ref)}`, { cache: 'no-store' })
      if (!response.ok) {
        const body = await parseBody(response)
        throw new Error(errorText(body) ?? '')
      }
      return response.arrayBuffer()
    },
    async loadMarks(ref) {
      const response = await request(`/agentero/api/marks?ref=${encodeURIComponent(ref)}`, { cache: 'no-store' })
      const body = await parseBody(response)
      if (!response.ok) throw new Error(errorText(body) ?? '')
      const data = envelopeData(body)
      const items = Array.isArray(data?.marks) ? data.marks : []
      const { scope } = await source.getVault()
      return items
        .map((item) => markFromWire(item, scope))
        .filter((mark): mark is PaintMark => mark !== undefined)
    },
    async addMark(body) {
      const response = await request('/agentero/api/marks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      })
      const parsed = await parseBody(response)
      if (!response.ok) throw new Error(errorText(parsed) ?? '')
      return translationOf(parsed)
    },
    async saveBookmarks(ref, nodes) {
      const response = await request('/agentero/api/pdf/bookmarks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ref, nodes }),
        cache: 'no-store',
      })
      const parsed = await parseBody(response)
      if (!response.ok) throw new Error(errorText(parsed) ?? '')
    },
    async translate(text) {
      const response = await request('/agentero/api/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, to: 'zh-CN' }),
        cache: 'no-store',
      })
      const parsed = await parseBody(response)
      if (!response.ok) throw new Error(errorText(parsed) ?? '')
      const data = envelopeData(parsed)
      const translated = data?.text
      if (typeof translated !== 'string' || translated.trim() === '') throw new Error('')
      return translated
    },
  }

  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TAB_ID,
    locale: NS,
    inject: (sessionId) => ({ ...face, ...pdfChatActions(ctx, sessionId) }),
  }, PdfPanel)))
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: TAB_ID,
    locale: NS,
  }, PdfTitle)))
}
