import { createPluginRegistration } from '@embedpdf/core'
import { EmbedPDF, useDocumentState } from '@embedpdf/core/react'
import type { PdfEngine } from '@embedpdf/models'
import { AnnotationPluginPackage } from '@embedpdf/plugin-annotation/react'
import { BookmarkPluginPackage } from '@embedpdf/plugin-bookmark/react'
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react'
import {
  GlobalPointerProvider,
  InteractionManagerPluginPackage,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react'
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react'
import { SearchPluginPackage } from '@embedpdf/plugin-search/react'
import {
  type PageLayout,
  Scroller,
  ScrollPluginPackage,
  ScrollStrategy,
  useScroll,
} from '@embedpdf/plugin-scroll/react'
import {
  SelectionLayer,
  SelectionPluginPackage,
  useSelectionCapability,
} from '@embedpdf/plugin-selection/react'
import { SpreadMode, SpreadPluginPackage } from '@embedpdf/plugin-spread/react'
import { TilingLayer, TilingPluginPackage } from '@embedpdf/plugin-tiling/react'
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react'
import {
  useZoom,
  ZoomGestureWrapper,
  ZoomMode,
  ZoomPluginPackage,
} from '@embedpdf/plugin-zoom/react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { EditableBookmark } from './bookmark'
import { CommentCards } from './comment-cards'
import { cn } from './cn'
import { loadPdfEngine } from './engine'
import { PdfFindLayer, PdfSearchLayer } from './find'
import { PdfLinkLayer } from './link-layer'
import { PdfOutlineLayer } from './outline'
import { PanDragHandler } from './pan-handler'
import { PdfToolbar } from './pdf-toolbar'
import { type PdfRegion } from './region'
import { cropPdfRegion } from './region-crop'
import { PdfRegionSelectLayer } from './region-select'
import { PdfTranslatePanel } from './translate-panel'
import {
  PDF_PAGE_RASTER_DARK_CLASS,
  PDF_PAPER_SHELL_CLASS,
  type PdfPaperTone,
} from './page-theme'
import { PdfBottomBar } from './pdf-bottom-bar'
import { DEFAULT_HIGHLIGHT_COLOR, highlightFill } from './palette'
import { PDF_FLOAT_CARD } from './pdf-chrome-surface'
import type { PaintMark, PdfPageSize, PdfRect } from './pdf-panel'
import { PDF_ZOOM_MAX, PDF_ZOOM_MIN } from './zoom'

/** Marks a rendered page so the selection menu can map page points to the screen. */
const EMBED_PAGE_ATTR = 'data-embed-pdf-page'

type PdfT = PropsLocale<'agentero.pdf'>['t']

export interface SelectionHit {
  quote: string
  page: number
  /** Page-point rectangles from the live selection. */
  rects: PdfRect[]
  /** Page size at scale 1, for normalizing per-id mark anchors. */
  pageWidth: number
  pageHeight: number
  screenX: number
  screenY: number
}

interface EmbedReaderProps {
  bytes: ArrayBuffer
  docId: string
  marks: readonly PaintMark[]
  pdfTone: PdfPaperTone
  onSetPdfTone: (tone: PdfPaperTone) => void
  onSelect: (hit: SelectionHit) => void
  /** The live text selection went away; the floating menu must hide. */
  onDeselect: () => void
  /** Persist the outline back into the PDF; resolves after the host wrote it. */
  saveBookmarks: (nodes: EditableBookmark[]) => Promise<void>
  /** Persist a cropped region as a visual mark. */
  saveVisual: (input: {
    page: number
    rects: PdfRect[]
    pageSize: PdfPageSize
    asset: { mediaType: string, data: string }
  }) => Promise<void>
  /** Translate one page's text through the host. */
  translate: (text: string) => Promise<string>
  menu: ReactNode
  t: PdfT
}

export function EmbedReader(props: EmbedReaderProps): ReactNode {
  const { bytes, docId, t } = props
  const [engine, setEngine] = useState<PdfEngine | undefined>(undefined)
  const [engineError, setEngineError] = useState('')

  useEffect(() => {
    let cancelled = false
    void loadPdfEngine().then((next) => {
      if (!cancelled) setEngine(next)
    }).catch((error: unknown) => {
      if (cancelled) return
      const text = error instanceof Error ? error.message : ''
      setEngineError(text === '' ? t('loadFailed') : text)
    })
    return () => { cancelled = true }
  }, [t])

  const buffer = useMemo(() => bytes.slice(0), [bytes])
  const plugins = useMemo(() => {
    const initialDocument = { buffer, documentId: docId, name: docId }
    return [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [initialDocument],
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(SpreadPluginPackage, {
        defaultSpreadMode: SpreadMode.None,
      }),
      createPluginRegistration(ScrollPluginPackage, {
        defaultBufferSize: 2,
        defaultStrategy: ScrollStrategy.Vertical,
      }),
      createPluginRegistration(RenderPluginPackage, {
        defaultImageType: 'image/bmp',
      }),
      createPluginRegistration(TilingPluginPackage),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitWidth,
        minZoom: PDF_ZOOM_MIN,
        maxZoom: PDF_ZOOM_MAX,
      }),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(SelectionPluginPackage, {
        marquee: { enabled: false },
      }),
      createPluginRegistration(SearchPluginPackage),
      createPluginRegistration(BookmarkPluginPackage),
      createPluginRegistration(AnnotationPluginPackage, {
        autoOpenLinks: false,
      }),
    ]
  }, [buffer, docId])

  if (engineError !== '') {
    return <p className="m-0 flex flex-1 items-center px-3 text-sm font-medium text-muted-foreground">{engineError}</p>
  }
  if (engine === undefined) {
    return <p className="m-0 flex flex-1 items-center px-3 text-sm font-medium text-muted-foreground">{t('loading')}</p>
  }

  return (
    <EmbedPDF key={docId} engine={engine} plugins={plugins}>
      <DocumentContent documentId={docId}>
        {({ isLoaded, isError, documentState }) => {
          if (isError) {
            const detail = documentState.error ?? ''
            return (
              <p className="m-0 flex flex-1 items-center px-3 text-sm font-medium text-muted-foreground">
                {detail === '' ? t('loadFailed') : detail}
              </p>
            )
          }
          if (!isLoaded) {
            return <p className="m-0 flex flex-1 items-center px-3 text-sm font-medium text-muted-foreground">{t('loading')}</p>
          }
          return <ReaderChrome {...props} engine={engine} />
        }}
      </DocumentContent>
    </EmbedPDF>
  )
}

type ReaderChromeProps = EmbedReaderProps & { engine: PdfEngine }

function ReaderChrome(props: ReaderChromeProps): ReactNode {
  const { docId, marks, pdfTone, onSetPdfTone, onSelect, onDeselect, saveBookmarks, saveVisual, translate, menu, engine, t } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const pageFocusedRef = useRef(false)
  const [pageField, setPageField] = useState('1')
  const scroll = useScroll(docId)
  const zoom = useZoom(docId)
  const { provides: selection } = useSelectionCapability()
  const page = scroll.state.currentPage
  const total = scroll.state.totalPages
  const zoomLevel = zoom.state.currentZoomLevel
  const zoomRef = useRef(zoomLevel)
  zoomRef.current = zoomLevel
  const documentState = useDocumentState(docId)
  const documentStateRef = useRef(documentState)
  documentStateRef.current = documentState
  const [regionSelecting, setRegionSelecting] = useState(false)
  const [translateOpen, setTranslateOpen] = useState(false)
  const [hint, setHint] = useState<{ text: string, error: boolean } | undefined>(undefined)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showHint = useCallback((text: string, error: boolean): void => {
    setHint({ text, error })
    if (hintTimer.current !== undefined) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHint(undefined), 2600)
  }, [])

  useEffect(() => () => {
    if (hintTimer.current !== undefined) clearTimeout(hintTimer.current)
  }, [])

  // ⌘. arms the region marquee while the reader is hovered or focused.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && regionSelecting) {
        setRegionSelecting(false)
        return
      }
      if (!(event.metaKey || event.ctrlKey) || event.key !== '.') return
      const host = hostRef.current
      if (host === null) return
      if (!host.matches(':hover') && !host.contains(document.activeElement)) return
      event.preventDefault()
      setRegionSelecting((value) => !value)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [regionSelecting, hostRef])

  useEffect(() => {
    if (pageFocusedRef.current) return
    if (page > 0) setPageField(String(page))
  }, [page])

  useEffect(() => {
    if (selection === null) return undefined
    const scope = selection.forDocument(docId)
    return scope.onEndSelection(() => {
      const pages = selection.getFormattedSelection(docId)
      const anchor = pages[pages.length - 1]
      if (anchor === undefined) return
      const host = hostRef.current
      const pageEl = host?.querySelector(`[${EMBED_PAGE_ATTR}="${anchor.pageIndex}"]`)
      let screenX = 0
      let screenY = 0
      if (pageEl instanceof HTMLElement) {
        const box = pageEl.getBoundingClientRect()
        const scale = zoomRef.current
        screenX = box.left + (anchor.rect.origin.x + anchor.rect.size.width / 2) * scale
        screenY = box.top + anchor.rect.origin.y * scale
      }
      const pageNumber = anchor.pageIndex + 1
      const rects: PdfRect[] = anchor.segmentRects.length > 0 ? anchor.segmentRects : [anchor.rect]
      const size = documentStateRef.current?.document?.pages[anchor.pageIndex]?.size
      void selection.getSelectedText(docId).toPromise().then((lines) => {
        const quote = (lines ?? []).join(' ').replace(/\s+/g, ' ').trim()
        if (quote === '') return
        onSelect({
          quote,
          page: pageNumber,
          rects,
          pageWidth: size !== undefined && size.width > 0 ? size.width : 0,
          pageHeight: size !== undefined && size.height > 0 ? size.height : 0,
          screenX,
          screenY,
        })
      }).catch(() => undefined)
    })
  }, [selection, docId, onSelect])

  useEffect(() => {
    if (selection === null) return undefined
    const scope = selection.forDocument(docId)
    return scope.onSelectionChange((range) => {
      if (range === null) onDeselect()
    })
  }, [selection, docId, onDeselect])

  const commitPageField = (): void => {
    const parsed = Number.parseInt(pageField, 10)
    if (!Number.isFinite(parsed)) {
      setPageField(String(Math.max(page, 1)))
      return
    }
    const next = Math.min(Math.max(total, 1), Math.max(1, parsed))
    setPageField(String(next))
    scroll.provides?.scrollToPage({ pageNumber: next })
  }

  const onRegionSelect = useCallback((pageNumber: number, region: PdfRegion): void => {
    setRegionSelecting(false)
    const document = documentStateRef.current?.document
    const pageInfo = document?.pages[pageNumber - 1]
    if (engine === undefined || document === null || document === undefined || pageInfo === undefined) return
    void cropPdfRegion({ engine, document, pageIndex: pageNumber - 1, region })
      .then((asset) => saveVisual({
        page: pageNumber,
        pageSize: pageInfo.size,
        rects: [{
          origin: { x: region.x * pageInfo.size.width, y: region.y * pageInfo.size.height },
          size: { width: region.w * pageInfo.size.width, height: region.h * pageInfo.size.height },
        }],
        asset,
      }))
      .then(() => showHint(t('regionSaved'), false))
      .catch(() => showHint(t('regionFailed'), true))
  }, [engine, saveVisual, showHint, t])

  const translatePage = useCallback(async (pageIndex: number): Promise<string> => {
    const document = documentStateRef.current?.document
    const pageInfo = document?.pages[pageIndex]
    if (engine === undefined || document === null || document === undefined || pageInfo === undefined) return ''
    const rects = await engine.getPageTextRects(document, pageInfo).toPromise()
    const text = rects.map((rect) => rect.content).join(' ').replace(/\s+/g, ' ').trim()
    if (text === '') return ''
    return translate(text)
  }, [engine, translate])

  const renderPage = useCallback((layout: PageLayout) => (
    <PdfPage
      documentId={docId}
      layout={layout}
      marks={marks}
      pdfTone={pdfTone}
      regionSelecting={regionSelecting}
      onRegionSelect={onRegionSelect}
      t={t}
    />
  ), [docId, marks, pdfTone, regionSelecting, onRegionSelect, t])

  return (
    <div className="relative h-full min-h-0">
      <div ref={hostRef} className="absolute inset-0">
        <Viewport documentId={docId} className="h-full bg-muted/40">
          <PanDragHandler hostRef={hostRef} />
          <ZoomGestureWrapper documentId={docId} enableWheel>
            <GlobalPointerProvider documentId={docId}>
              <Scroller documentId={docId} renderPage={renderPage} />
            </GlobalPointerProvider>
          </ZoomGestureWrapper>
        </Viewport>
      </div>
      {menu}
      <PdfFindLayer docId={docId} hostRef={hostRef} t={t} />
      <PdfToolbar
        regionSelecting={regionSelecting}
        translating={false}
        translateOpen={translateOpen}
        onToggleRegion={() => setRegionSelecting((value) => !value)}
        onToggleTranslate={() => setTranslateOpen((value) => !value)}
        t={t}
      />
      <PdfTranslatePanel
        open={translateOpen}
        page={Math.max(page, 1)}
        total={Math.max(total, 1)}
        translate={translatePage}
        onClose={() => setTranslateOpen(false)}
        t={t}
      />
      {hint === undefined ? null : (
        <p
          className={cn(
            'pointer-events-none absolute top-14 left-1/2 z-30 -translate-x-1/2 px-3 py-1.5 text-xs',
            PDF_FLOAT_CARD,
            hint.error && 'text-destructive',
          )}
          role="status"
        >
          {hint.text}
        </p>
      )}
      <PdfOutlineLayer
        docId={docId}
        currentPage={Math.max(page, 1)}
        onGoToPage={(pageNumber) => { scroll.provides?.scrollToPage({ pageNumber }) }}
        onSave={saveBookmarks}
        t={t}
      />
      <PdfBottomBar
        totalPages={total}
        pageField={pageField}
        onPageFieldChange={setPageField}
        pageFocusedRef={pageFocusedRef}
        onCommitPageField={commitPageField}
        pdfTone={pdfTone}
        onSetPdfTone={onSetPdfTone}
        zoomLevel={zoomLevel}
        onZoomChange={(level) => { zoom.provides?.requestZoom(level) }}
        t={t}
      />
    </div>
  )
}

function PdfPage(props: {
  documentId: string
  layout: PageLayout
  marks: readonly PaintMark[]
  pdfTone: PdfPaperTone
  regionSelecting: boolean
  onRegionSelect: (page: number, region: PdfRegion) => void
  t: PdfT
}): ReactNode {
  const { documentId, layout, marks, pdfTone, regionSelecting, onRegionSelect, t } = props
  const documentState = useDocumentState(documentId)
  const size = documentState?.document?.pages[layout.pageIndex]?.size
  const cssW = layout.rotatedWidth || layout.width
  const cssH = layout.rotatedHeight || layout.height
  const pageNumber = layout.pageIndex + 1
  const pageMarks = marks.filter(mark => mark.page === pageNumber)
  const pageSize = {
    width: size?.width && size.width > 0 ? size.width : cssW,
    height: size?.height && size.height > 0 ? size.height : cssH,
  }
  const dark = pdfTone === 'dark'
  const overlays = pageMarks.flatMap(mark => mark.rects.map((rect, index) => {
    const x = mark.space === 'pt' ? rect.x / pageSize.width : rect.x
    const y = mark.space === 'pt' ? rect.y / pageSize.height : rect.y
    const w = mark.space === 'pt' ? rect.w / pageSize.width : rect.w
    const h = mark.space === 'pt' ? rect.h / pageSize.height : rect.h
    const color = mark.kind === 'translate'
      ? 'rgba(80, 140, 255, 0.28)'
      : mark.kind === 'ask'
        ? 'rgba(80, 180, 120, 0.28)'
        : mark.kind === 'visual'
          ? 'rgba(120, 120, 120, 0.14)'
          : highlightFill(mark.color ?? DEFAULT_HIGHLIGHT_COLOR)
    return (
      <div
        key={`${mark.id}:${index}`}
        className="pointer-events-none absolute z-[1]"
        style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`, background: color }}
      />
    )
  }))

  return (
    <PagePointerProvider
      documentId={documentId}
      pageIndex={layout.pageIndex}
      {...{ [EMBED_PAGE_ATTR]: layout.pageIndex }}
      className={cn('relative', PDF_PAPER_SHELL_CLASS[pdfTone])}
      style={{ width: cssW, height: cssH }}
    >
      <RenderLayer
        documentId={documentId}
        pageIndex={layout.pageIndex}
        className={cn('pointer-events-none absolute inset-0', dark && PDF_PAGE_RASTER_DARK_CLASS)}
      />
      <TilingLayer
        documentId={documentId}
        pageIndex={layout.pageIndex}
        className={cn('pointer-events-none absolute inset-0', dark && PDF_PAGE_RASTER_DARK_CLASS)}
      />
      {overlays}
      <PdfLinkLayer
        docId={documentId}
        pageIndex={layout.pageIndex}
        pageWidth={pageSize.width}
        pageHeight={pageSize.height}
        t={t}
      />
      <PdfSearchLayer docId={documentId} pageIndex={layout.pageIndex} />
      <SelectionLayer documentId={documentId} pageIndex={layout.pageIndex} />
      <PdfRegionSelectLayer
        active={regionSelecting}
        label={t('regionLabel')}
        onSelect={(region) => onRegionSelect(pageNumber, region)}
      />
      <CommentCards marks={pageMarks} pageHeight={cssH} pageSize={pageSize} t={t} />
    </PagePointerProvider>
  )
}
