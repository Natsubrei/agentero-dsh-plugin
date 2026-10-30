import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { en, zh } from './locale'
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
    }
  }
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    /** Paper directory passed when the library opens this page. */
    'agentero.pdf': { readonly ref?: string }
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Notes column this panel declares and renders. */
    'agentero.pdf.notes': {
      kind: 'single'
      scope: 'session'
      owner: { paperPath: string }
    }
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

function pointRect(value: unknown): { x: number, y: number, w: number, h: number } | undefined {
  const record = recordOf(value)
  if (record === undefined) return undefined
  const origin = recordOf(record.origin)
  const size = recordOf(record.size)
  if (origin === undefined || size === undefined) return undefined
  const x = origin.x
  const y = origin.y
  const w = size.width
  const h = size.height
  if (typeof x !== 'number' || typeof y !== 'number' || typeof w !== 'number' || typeof h !== 'number') return undefined
  if (w <= 0 || h <= 0) return undefined
  return { x, y, w, h }
}

function normRect(value: unknown): { x: number, y: number, w: number, h: number } | undefined {
  const record = recordOf(value)
  if (record === undefined) return undefined
  const { x, y, w, h } = record
  if (typeof x !== 'number' || typeof y !== 'number' || typeof w !== 'number' || typeof h !== 'number') return undefined
  if (w <= 0 || h <= 0) return undefined
  return { x, y, w, h }
}

function paintFromAnnotation(item: unknown): PaintMark | undefined {
  const record = recordOf(item)
  const annotation = recordOf(record?.annotation) ?? record
  if (annotation === undefined) return undefined
  const id = typeof annotation.id === 'string' ? annotation.id : ''
  if (id === '') return undefined
  const pageIndex = annotation.pageIndex
  const page = typeof pageIndex === 'number' ? pageIndex + 1 : 0
  if (page < 1) return undefined
  const rawRects = Array.isArray(annotation.segmentRects) ? annotation.segmentRects : [annotation.rect]
  const rects = rawRects.map(pointRect).filter((rect): rect is { x: number, y: number, w: number, h: number } => rect !== undefined)
  const custom = recordOf(annotation.custom)
  const quote = typeof custom?.quote === 'string' ? custom.quote : ''
  const contents = typeof annotation.contents === 'string' ? annotation.contents : ''
  return { id, kind: 'highlight', page, rects, space: 'pt', note: contents || quote }
}

function paintFromMark(item: unknown): PaintMark | undefined {
  const record = recordOf(item)
  if (record === undefined) return undefined
  if (record.annotation !== undefined) return paintFromAnnotation(record)
  const id = typeof record.id === 'string' ? record.id : ''
  const kind = typeof record.kind === 'string' ? record.kind : ''
  if (id === '' || kind === '') return undefined
  const anchor = recordOf(record.anchor)
  const pageValue = record.page ?? anchor?.page
  const page = typeof pageValue === 'number' ? pageValue : 0
  if (page < 1) return undefined
  const rawRects = Array.isArray(record.rects) ? record.rects : anchor?.rects
  const rects = Array.isArray(rawRects)
    ? rawRects.map(normRect).filter((rect): rect is { x: number, y: number, w: number, h: number } => rect !== undefined)
    : []
  const result = typeof record.result === 'string' ? record.result : ''
  const comment = typeof record.comment === 'string' ? record.comment : ''
  return { id, kind, page, rects, space: 'norm', note: result || comment }
}

function marksFromFile(text: string): PaintMark[] {
  try {
    const parsed: unknown = JSON.parse(text)
    if (Array.isArray(parsed)) {
      return parsed.map(paintFromAnnotation).filter((mark): mark is PaintMark => mark !== undefined)
    }
    const one = paintFromMark(parsed)
    return one === undefined ? [] : [one]
  } catch {
    return []
  }
}

function listPaths(body: unknown): string[] {
  const data = envelopeData(body)
  const items = data?.items
  if (!Array.isArray(items)) return []
  const paths: string[] = []
  for (const item of items) {
    const record = recordOf(item)
    const path = record?.path
    if (typeof path === 'string' && path !== '' && !paths.includes(path)) paths.push(path)
  }
  return paths
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
export const inject = ['slots', 'locale', 'agentero', 'sidebarRight', 'sidebarRightTabs']

/**
 * Register the PDF page in the session's right sidebar and the paper opener.
 * The library still calls `agentero.open`. This opener focuses the one PDF tab.
 * @param ctx - Browser plugin context.
 */
export function apply(ctx: Context): void {
  const request = ctx.agentero.request.bind(ctx.agentero)
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

  const face: PdfInjected = {
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
      const paths = listPaths(body)
      const marks: PaintMark[] = []
      const seen = new Set<string>()
      for (const path of paths) {
        const file = await request(`/agentero/api/notes/file?path=${encodeURIComponent(path)}`, { cache: 'no-store' })
        const parsed = await parseBody(file)
        if (!file.ok) continue
        const record = recordOf(parsed)
        const text = typeof record?.text === 'string' ? record.text : ''
        for (const mark of marksFromFile(text)) {
          if (seen.has(mark.id)) continue
          seen.add(mark.id)
          marks.push(mark)
        }
      }
      return marks
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
    async cite(sessionId, text) {
      const response = await request('/agentero/api/context', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, text }),
        cache: 'no-store',
      })
      const parsed = await parseBody(response)
      if (!response.ok) throw new Error(errorText(parsed) ?? '')
    },
  }

  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TAB_ID,
    locale: NS,
    children: {
      'agentero.pdf.notes': { kind: 'single', scope: 'session' },
    },
    inject: () => face,
  }, PdfPanel)))
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: TAB_ID,
    locale: NS,
  }, PdfTitle)))
}
