import type { PdfTextRun } from '@embedpdf/models'
import { groupReadingLines } from './reading-order'
import { unionBoxes, type Box } from './types'

export interface PdfLayoutRegion {
  id: string
  pageIndex: number
  kind: string
  label: string
  score: number
  readingOrder: number
  rect: Box
  bbox: Box
}
export type LayoutTranslateItem = Pick<PdfLayoutRegion, 'id' | 'pageIndex' | 'kind' | 'bbox'>

function box(value: unknown): Box | undefined {
  if (!value || typeof value !== 'object') return undefined
  const b = value as Box
  if (![b.x, b.y, b.w, b.h].every(Number.isFinite) || b.w <= 0 || b.h <= 0) return undefined
  return { x: b.x, y: b.y, w: b.w, h: b.h }
}

/** Motif stores normalized boxes in source/layout.json. Ignore unusable records. */
export function parseLayoutRegions(raw: unknown): PdfLayoutRegion[] {
  if (!raw || typeof raw !== 'object' || !('regions' in raw) || !Array.isArray(raw.regions)) return []
  return raw.regions.flatMap((value: unknown) => {
    if (!value || typeof value !== 'object') return []
    const r = value as PdfLayoutRegion
    const rect = box(r.rect), bbox = box(r.bbox)
    if (typeof r.id !== 'string' || typeof r.kind !== 'string' || !Number.isInteger(r.pageIndex) || r.pageIndex < 0 || !rect || !bbox) return []
    if (bbox.x < 0 || bbox.y < 0 || bbox.x + bbox.w > 1.01 || bbox.y + bbox.h > 1.01) return []
    return [{ ...r, rect, bbox, label: typeof r.label === 'string' ? r.label : r.kind,
      score: Number.isFinite(r.score) ? r.score : 1, readingOrder: Number.isFinite(r.readingOrder) ? r.readingOrder : 0 }]
  })
}

/** Text-only fallback: baseline grouping from motif, split columns before joining paragraphs. */
export function regionsFromRuns(runs: readonly PdfTextRun[], pageIndex: number, width: number, height: number): PdfLayoutRegion[] {
  const usable = runs.filter(run => run.text.trim() && run.rect.size.width > 0 && run.rect.size.height > 0)
  const lines = groupReadingLines(usable, run => ({ ...run.rect.origin, ...run.rect.size }))
  const fragments: { box: Box, size: number, bold: boolean, text: string }[] = []
  for (const line of lines) {
    let group: PdfTextRun[] = []
    const flush = (): void => {
      if (!group.length) return
      const rect = unionBoxes(group.map(r => ({ x: r.rect.origin.x, y: r.rect.origin.y, w: r.rect.size.width, h: r.rect.size.height })))
      fragments.push({ box: rect, size: Math.max(...group.map(r => r.fontSize)), bold: group.every(r => r.font.weight >= 600), text: group.map(r => r.text).join(' ') })
      group = []
    }
    for (const run of line.items) {
      const last = group.at(-1)
      if (last && run.rect.origin.x - last.rect.origin.x - last.rect.size.width > Math.max(last.fontSize, run.fontSize) * 1.5) flush()
      group.push(run)
    }
    flush()
  }
  const groups: typeof fragments = []
  for (const fragment of fragments) {
    const prior = [...groups].reverse().find(g => {
      const gap = fragment.box.y - g.box.y - g.box.h
      return gap >= -1 && gap < fragment.size * 0.9 && Math.abs(g.box.x - fragment.box.x) < fragment.size * 1.5
        && Math.abs(g.box.w - fragment.box.w) < Math.max(g.box.w, fragment.box.w) * 0.35
        && Math.abs(g.size - fragment.size) < 1 && g.bold === fragment.bold
    })
    if (prior) { prior.box = unionBoxes([prior.box, fragment.box]); prior.text += ` ${fragment.text}` }
    else groups.push({ ...fragment })
  }
  const sizes = usable.map(r => r.fontSize).sort((a, b) => a - b)
  const bodySize = sizes[Math.floor(sizes.length / 2)] ?? 10
  return groups.filter(g => /\p{L}{2}/u.test(g.text)).map((g, index) => ({
    id: `${pageIndex}:text:${index}`, pageIndex, readingOrder: index, score: 1,
    kind: g.size > bodySize * 1.2 || (g.bold && g.text.length < 100) ? 'header' : 'text',
    label: 'text', rect: g.box,
    bbox: { x: g.box.x / width, y: g.box.y / height, w: g.box.w / width, h: g.box.h / height },
  }))
}
