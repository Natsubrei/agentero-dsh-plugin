import type { PdfDocumentObject, PdfEngine } from '@embedpdf/models'
import { useEffect, useRef, useState } from 'react'
import { extractReflowDocument } from './extract'
import { browserReflowFonts } from './fonts'
import { layoutReflowDocument } from './layout'
import { parseLayoutRegions, regionsFromRuns } from './regions'
import { type ParagraphLayout, type ReflowPage } from './types'
import { translateParagraph } from './translate-paragraph'

export interface TranslatedPage {
  source: ReflowPage
  layouts: ParagraphLayout[]
  formulas: Map<string, string>
  translations: Map<string, string>
  error: string
  done: boolean
}

/** Crop formula pixels once; formula layout uses original dimensions and baselines. */
async function formulaImages(engine: PdfEngine, document: PdfDocumentObject, source: ReflowPage, signal: AbortSignal): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (!source.paragraphs.some(p => p.formulas.length)) return result
  const blob = await engine.renderPage(document, document.pages[source.index]!, { scaleFactor: 2, imageType: 'image/png', withAnnotations: false }).toPromise()
  signal.throwIfAborted()
  const bitmap = await createImageBitmap(blob)
  try {
    const sx = bitmap.width / source.width, sy = bitmap.height / source.height
    for (const p of source.paragraphs) for (const f of p.formulas) {
      const canvas = window.document.createElement('canvas')
      canvas.width = Math.max(1, Math.ceil(f.box.w * sx))
      canvas.height = Math.max(1, Math.ceil(f.box.h * sy))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Formula rendering is unavailable')
      ctx.drawImage(bitmap, f.box.x * sx, f.box.y * sy, f.box.w * sx, f.box.h * sy, 0, 0, canvas.width, canvas.height)
      result.set(`${p.id}:${f.id}`, canvas.toDataURL('image/png'))
    }
  } finally { bitmap.close() }
  return result
}

export function usePageTranslation(options: {
  open: boolean
  currentPage: number
  document: PdfDocumentObject | null | undefined
  engine: PdfEngine
  loadLayout: (signal?: AbortSignal) => Promise<unknown>
  translate: (text: string, signal?: AbortSignal) => Promise<string>
}) {
  const { open, currentPage, document, engine, loadLayout, translate } = options
  const cache = useRef(new Map<number, TranslatedPage>())
  const [pages, setPages] = useState<ReadonlyMap<number, TranslatedPage>>(new Map())
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const loadRef = useRef(loadLayout)
  loadRef.current = loadLayout

  useEffect(() => {
    cache.current.clear()
    setPages(new Map())
  }, [document?.id])

  useEffect(() => {
    if (!open || !document) { setRunning(false); return }
    const controller = new AbortController()
    const { signal } = controller
    const publish = (): void => {
      if (!signal.aborted) setPages(new Map([...cache.current].map(([index, state]) => [index, { ...state }])))
    }
    const run = async (): Promise<void> => {
      setRunning(true)
      setError('')
      await window.document.fonts.ready
      signal.throwIfAborted()
      const fonts = browserReflowFonts()
      const regions = parseLayoutRegions(await loadRef.current(signal))
      const order = [currentPage - 1, ...document.pages.map(p => p.index).filter(i => i !== currentPage - 1)]
      for (const pageIndex of order) {
        signal.throwIfAborted()
        const page = document.pages[pageIndex]
        if (!page || cache.current.get(pageIndex)?.done) continue
        try {
          let state = cache.current.get(pageIndex)
          if (!state) {
            let pageRegions = regions.filter(r => r.pageIndex === pageIndex)
            if (!pageRegions.length) {
              const { runs } = await engine.getPageTextRuns(document, page).toPromise()
              signal.throwIfAborted()
              pageRegions = regionsFromRuns(runs, pageIndex, page.size.width, page.size.height)
            }
            const items = pageRegions.filter(r => ['text', 'abstract', 'header', 'figure_title'].includes(r.kind) && r.score >= 0.5)
            // A zero-sized seed lets motif's character coverage recover text when layout has no prose regions.
            const seed = items.length ? items : [{ id: `${pageIndex}:seed`, pageIndex, kind: 'text', bbox: { x: 0, y: 0, w: 0, h: 0 } }]
            const ir = await extractReflowDocument(engine, { ...document, pages: [page] }, seed, pageRegions, signal)
            signal.throwIfAborted()
            const source = ir.pages[0]
            if (!source) continue
            // Without semantic layout, do not expand over an undetected figure or table.
            if (!regions.some(r => r.pageIndex === pageIndex)) for (const p of source.paragraphs) p.fixedBox = true
            state = { source, layouts: [], formulas: await formulaImages(engine, document, source, signal), translations: new Map(), error: '', done: false }
            signal.throwIfAborted()
            cache.current.set(pageIndex, state)
          }
          state.error = ''
          for (const paragraph of state.source.paragraphs) {
            signal.throwIfAborted()
            if (state.translations.has(paragraph.id)) continue
            try {
              const result = await translateParagraph(paragraph, translate, signal)
              signal.throwIfAborted()
              const next = new Map(state.translations).set(paragraph.id, result)
              const layouts = layoutReflowDocument({ version: 1, pages: [state.source] }, next, fonts)[0]?.paragraphs ?? []
              if (layouts.some(p => !p.fits)) throw new Error('Translation does not fit its page region')
              state.translations = next
              state.layouts = layouts
              publish()
            } catch (cause) {
              signal.throwIfAborted()
              state.error = cause instanceof Error ? cause.message : String(cause)
              setError(state.error)
              // Keep completed regions; another model request with broken credentials cannot help.
              if (state.translations.size === 0) throw cause
            }
          }
          state.done = state.translations.size === state.source.paragraphs.length
          cache.current.set(pageIndex, { ...state })
          publish()
        } catch (cause) {
          signal.throwIfAborted()
          throw cause
        }
      }
    }
    void run().catch((cause: unknown) => {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : String(cause))
    }).finally(() => { if (!signal.aborted) setRunning(false) })
    return () => { controller.abort() }
  }, [open, currentPage, document, engine, translate, retry])

  return { pages, running, error, retry: () => setRetry(value => value + 1) }
}
