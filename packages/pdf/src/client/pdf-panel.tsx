import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { cn } from './cn'
import { EmbedReader, type SelectionHit } from './embed-reader'
import type { EditableBookmark } from './bookmark'
import { type PdfPaperTone } from './page-theme'
import { DEFAULT_HIGHLIGHT_COLOR, type HighlightColor } from './palette'
import { PDF_FLOAT_CARD } from './pdf-chrome-surface'
import { SelectionMenu } from './selection-menu'

export interface PaintRect {
  x: number
  y: number
  w: number
  h: number
}

export interface PaintMark {
  id: string
  kind: string
  page: number
  rects: PaintRect[]
  space: 'norm' | 'pt'
  note: string
  /** Highlight palette key, when the store carries one. */
  color?: HighlightColor
  /** Host image URL tied to the source knowledge base. */
  asset?: string
}

/** Page rectangle in PDF points, the shape the selection plugin reports. */
export interface PdfRect {
  origin: { x: number, y: number }
  size: { width: number, height: number }
}

export interface PdfPageSize {
  width: number
  height: number
}

export interface MarkAdd {
  ref: string
  kind: 'highlight' | 'ask' | 'translate' | 'visual'
  quote: string
  page: number
  /** Page-point selection rectangles; lets the host write without the CLI. */
  rects?: PdfRect[]
  pageSize?: PdfPageSize
  color?: HighlightColor
  comment?: string
  question?: string
  /** Visual region crop (bare base64 PNG), stored under marks/assets. */
  asset?: { mediaType: string, data: string }
}

export interface PdfInjected {
  loadPdf: (ref: string) => Promise<ArrayBuffer>
  loadMarks: (ref: string) => Promise<PaintMark[]>
  addMark: (body: MarkAdd) => Promise<string | undefined>
  cite: (sessionId: string, text: string) => Promise<void>
  /** Write the PDF outline back to the file; resolves after the host saved it. */
  saveBookmarks: (ref: string, nodes: EditableBookmark[]) => Promise<void>
  /** Translate one page's text; rejects with the host error message. */
  translate: (text: string) => Promise<string>
}

type PdfPanelProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & InjectFace<PdfInjected>
  & PropsLocale<'agentero.pdf'>

interface MenuState {
  quote: string
  page: number
  /** Selection geometry, so the mark is written without a quote lookup. */
  rects: PdfRect[]
  pageSize: PdfPageSize
  color: HighlightColor
  screenX: number
  screenY: number
  mode: 'actions' | 'comment' | 'ask'
}

export function paperRef(params: unknown): string {
  if (params === null || typeof params !== 'object' || !('ref' in params)) return ''
  const ref = params.ref
  return typeof ref === 'string' ? ref : ''
}

export function PdfTitle({ useTabInfo, t }: PropsRuntime<'sidebar.right.pane.tab.title'> & PropsLocale<'agentero.pdf'>): ReactNode {
  const ref = paperRef(useTabInfo().tab.navigation.params)
  const name = ref.split('/').filter(part => part !== '').pop()
  return <span>{name === undefined || name === '' ? t('title') : name}</span>
}

export function PdfPanel(props: PdfPanelProps): ReactNode {
  const { t, sessionId, useTabInfo, loadPdf, loadMarks, addMark, cite, saveBookmarks, translate } = props
  const paperPath = paperRef(useTabInfo().tab.navigation.params)
  const [status, setStatus] = useState<'empty' | 'loading' | 'missing' | 'error' | 'ready'>('empty')
  const [message, setMessage] = useState('')
  const [bytes, setBytes] = useState<ArrayBuffer | undefined>(undefined)
  const [marks, setMarks] = useState<PaintMark[]>([])
  const [menu, setMenu] = useState<MenuState | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [banner, setBanner] = useState('')
  const [busy, setBusy] = useState(false)
  const [selectionClearVersion, setSelectionClearVersion] = useState(0)
  const [pdfTone, setPdfTone] = useState<PdfPaperTone>('white')

  const onSelect = useCallback((hit: SelectionHit) => {
    setDraft('')
    setMenu({
      quote: hit.quote,
      page: hit.page,
      rects: hit.rects,
      pageSize: { width: hit.pageWidth, height: hit.pageHeight },
      color: DEFAULT_HIGHLIGHT_COLOR,
      screenX: hit.screenX,
      screenY: hit.screenY,
      mode: 'actions',
    })
  }, [])

  const onDeselect = useCallback(() => {
    setMenu(undefined)
    setDraft('')
  }, [])

  useEffect(() => {
    let cancelled = false
    setBytes(undefined)
    setMarks([])
    setMenu(undefined)
    setBanner('')
    if (paperPath === '') {
      setStatus('empty')
      return () => { cancelled = true }
    }
    setStatus('loading')
    void loadPdf(paperPath).then(async (next) => {
      if (cancelled) return
      setBytes(next)
      setStatus('ready')
      const painted = await loadMarks(paperPath)
      if (!cancelled) setMarks(painted)
    }).catch((error: unknown) => {
      if (cancelled) return
      const text = error instanceof Error ? error.message : ''
      if (text === 'vault is not configured') {
        setStatus('error')
        setMessage(t('vaultMissing'))
        return
      }
      if (text === 'not found') {
        setStatus('missing')
        return
      }
      setStatus('error')
      setMessage(text === '' ? t('loadFailed') : text)
    })
    return () => { cancelled = true }
  }, [paperPath, loadPdf, loadMarks, t])

  const refreshMarks = (): void => {
    if (paperPath === '') return
    void loadMarks(paperPath).then(setMarks).catch(() => { setBanner(t('markFailed')) })
  }

  const saveVisual = useCallback(async (input: {
    page: number
    rects: PdfRect[]
    pageSize: PdfPageSize
    asset: { mediaType: string, data: string }
  }): Promise<void> => {
    await addMark({
      ref: paperPath,
      kind: 'visual',
      quote: '',
      page: input.page,
      rects: input.rects,
      pageSize: input.pageSize,
      asset: input.asset,
    })
    refreshMarks()
  }, [paperPath, addMark, loadMarks, t])

  const runMark = (body: MarkAdd): void => {
    setBusy(true)
    setMenu(undefined)
    void addMark(body).then((translation) => {
      if (translation !== undefined) setBanner(translation)
      setSelectionClearVersion((version) => version + 1)
      refreshMarks()
    }).catch((error: unknown) => {
      const text = error instanceof Error ? error.message : ''
      setBanner(text === '' ? t('markFailed') : text)
    }).finally(() => { setBusy(false) })
  }

  const citeQuote = (question?: string): void => {
    if (menu === undefined) return
    if (sessionId === undefined) {
      setBanner(t('noSession'))
      setMenu(undefined)
      return
    }
    const lines = [`${paperPath} p.${menu.page}`, menu.quote]
    if (question !== undefined && question.trim() !== '') lines.push(question.trim())
    setBusy(true)
    setMenu(undefined)
    void cite(sessionId, lines.join('\n')).catch((error: unknown) => {
      const text = error instanceof Error ? error.message : ''
      setBanner(text === '' ? t('citeFailed') : text)
    }).finally(() => { setBusy(false) })
  }

  const submitDraft = (): void => {
    if (menu === undefined) return
    const quote = menu.quote
    const pageNumber = menu.page
    const geometry = { rects: menu.rects, pageSize: menu.pageSize }
    if (menu.mode === 'ask') {
      setMenu(undefined)
      setBusy(true)
      void addMark({
        ref: paperPath,
        kind: 'ask',
        quote,
        page: pageNumber,
        ...geometry,
        question: draft,
      }).then(async () => {
        if (sessionId === undefined) {
          setBanner(t('noSession'))
          refreshMarks()
          return
        }
        await cite(sessionId, [`${paperPath} p.${pageNumber}`, quote, draft.trim()].filter(line => line !== '').join('\n'))
      }).catch((error: unknown) => {
        const text = error instanceof Error ? error.message : ''
        setBanner(text === '' ? t('citeFailed') : text)
      }).finally(() => { setBusy(false) })
      return
    }
    runMark({
      ref: paperPath,
      kind: 'highlight',
      quote,
      page: pageNumber,
      ...geometry,
      color: menu.color,
      comment: draft,
    })
  }

  const selectionMenu = menu === undefined ? null : (
    <SelectionMenu
      screen={{ x: menu.screenX, y: menu.screenY }}
      mode={menu.mode}
      draft={draft}
      busy={busy}
      t={t}
      onCopy={async () => {
        try {
          await navigator.clipboard.writeText(menu.quote)
          return true
        } catch {
          return false
        }
      }}
      onHighlight={(color) => {
        setMenu({ ...menu, color })
        runMark({
          ref: paperPath,
          kind: 'highlight',
          quote: menu.quote,
          page: menu.page,
          rects: menu.rects,
          pageSize: menu.pageSize,
          color,
        })
      }}
      onComment={() => { setMenu({ ...menu, mode: 'comment' }) }}
      onTranslate={() => {
        runMark({
          ref: paperPath,
          kind: 'translate',
          quote: menu.quote,
          page: menu.page,
          rects: menu.rects,
          pageSize: menu.pageSize,
        })
      }}
      onCite={() => { citeQuote() }}
      onAsk={() => { setMenu({ ...menu, mode: 'ask' }) }}
      onDraftChange={setDraft}
      onSubmitDraft={submitDraft}
    />
  )

  let body: ReactNode
  if (status === 'empty') body = <p className="m-0 flex flex-1 items-center px-3 text-sm font-medium text-muted-foreground">{t('empty')}</p>
  else if (status === 'loading') body = <p className="m-0 flex flex-1 items-center px-3 text-sm font-medium text-muted-foreground">{t('loading')}</p>
  else if (status === 'missing') body = <p className="m-0 flex flex-1 items-center px-3 text-sm font-medium text-muted-foreground">{t('missing')}</p>
  else if (status === 'error') body = <p className="m-0 flex flex-1 items-center px-3 text-sm font-medium text-muted-foreground">{message}</p>
  else {
    body = bytes === undefined ? null : (
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {banner === '' ? null : (
            <p className={cn('m-3 whitespace-pre-wrap px-3 py-2 text-sm', PDF_FLOAT_CARD)}>{banner}</p>
          )}
          <div className="relative min-h-0 flex-1">
            <EmbedReader
              bytes={bytes}
              docId={paperPath}
              marks={marks}
              pdfTone={pdfTone}
              onSetPdfTone={setPdfTone}
              onSelect={onSelect}
              onDeselect={onDeselect}
              selectionClearVersion={selectionClearVersion}
              saveBookmarks={(nodes) => saveBookmarks(paperPath, nodes)}
              saveVisual={saveVisual}
              translate={translate}
              menu={selectionMenu}
              t={t}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="agentero-pdf agentero-surface flex h-full min-h-0 flex-col">
      {body}
    </div>
  )
}
