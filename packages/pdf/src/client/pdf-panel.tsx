import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { cn } from './cn'
import { EmbedReader, type SelectionHit } from './embed-reader'
import { type PdfPaperTone } from './page-theme'
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
}

export interface MarkAdd {
  ref: string
  kind: 'highlight' | 'ask' | 'translate'
  quote: string
  page: number
  comment?: string
  question?: string
}

export interface PdfInjected {
  loadPdf: (ref: string) => Promise<ArrayBuffer>
  loadMarks: (ref: string) => Promise<PaintMark[]>
  addMark: (body: MarkAdd) => Promise<string | undefined>
  cite: (sessionId: string, text: string) => Promise<void>
}

type PdfPanelProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsRenderSlots<'agentero.pdf.notes'>
  & InjectFace<PdfInjected>
  & PropsLocale<'agentero.pdf'>

interface MenuState {
  quote: string
  page: number
  screenX: number
  screenY: number
  mode: 'actions' | 'comment' | 'ask'
}

const SURFACE_CSS = `
.agentero-pdf, .agentero-pdf *, .agentero-pdf *::before, .agentero-pdf *::after {
  box-sizing: border-box;
}
.agentero-pdf button, .agentero-pdf input {
  font: inherit;
  color: inherit;
  background-color: transparent;
  border-style: solid;
}
.agentero-pdf button {
  cursor: pointer;
}
`

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
  const { t, renderSlot, sessionId, useTabInfo, loadPdf, loadMarks, addMark, cite } = props
  const paperPath = paperRef(useTabInfo().tab.navigation.params)
  const [status, setStatus] = useState<'empty' | 'loading' | 'missing' | 'error' | 'ready'>('empty')
  const [message, setMessage] = useState('')
  const [bytes, setBytes] = useState<ArrayBuffer | undefined>(undefined)
  const [marks, setMarks] = useState<PaintMark[]>([])
  const [menu, setMenu] = useState<MenuState | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [banner, setBanner] = useState('')
  const [busy, setBusy] = useState(false)
  const [pdfTone, setPdfTone] = useState<PdfPaperTone>('white')

  const onSelect = useCallback((hit: SelectionHit) => {
    setDraft('')
    setMenu({
      quote: hit.quote,
      page: hit.page,
      screenX: hit.screenX,
      screenY: hit.screenY,
      mode: 'actions',
    })
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

  const runMark = (body: MarkAdd): void => {
    setBusy(true)
    setMenu(undefined)
    void addMark(body).then((translation) => {
      if (translation !== undefined) setBanner(translation)
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
    if (menu.mode === 'ask') {
      setMenu(undefined)
      setBusy(true)
      void addMark({ ref: paperPath, kind: 'ask', quote, page: pageNumber, question: draft }).then(async () => {
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
    runMark({ ref: paperPath, kind: 'highlight', quote, page: pageNumber, comment: draft })
  }

  const notes = paperPath === '' ? null : renderSlot('agentero.pdf.notes', { paperPath })
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
      onHighlight={() => {
        runMark({ ref: paperPath, kind: 'highlight', quote: menu.quote, page: menu.page })
      }}
      onComment={() => { setMenu({ ...menu, mode: 'comment' }) }}
      onTranslate={() => {
        runMark({ ref: paperPath, kind: 'translate', quote: menu.quote, page: menu.page })
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
              menu={selectionMenu}
              t={t}
            />
          </div>
        </div>
        {notes === null || notes === undefined ? null : (
          <div className="w-[22rem] min-h-0 min-w-0 shrink-0 overflow-auto border-s border-border">{notes}</div>
        )}
      </div>
    )
  }

  return (
    <div className="agentero-pdf agentero-surface flex h-full min-h-0 flex-col">
      <style>{SURFACE_CSS}</style>
      {body}
    </div>
  )
}
