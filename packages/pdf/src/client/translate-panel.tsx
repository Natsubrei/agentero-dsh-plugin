import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Languages, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from './button'

type PdfT = PropsLocale<'agentero.pdf'>['t']

interface TranslationView {
  page: number
  text: string
  error: string
}

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error.trim()
  if (error instanceof Error) return error.message.trim()
  return ''
}

/**
 * Right-side reading panel for page-by-page translation.
 *
 * Pages are fetched on demand, cached for the lifetime of the component, and
 * the remaining pages are prefetched in the background after the current page
 * settles. Only the current page is ever rendered; prefetched text waits in
 * the cache until the reader navigates to it.
 */
export function PdfTranslatePanel({
  open,
  page,
  total,
  translate,
  onClose,
  t,
}: {
  open: boolean
  page: number
  total: number
  translate: (pageIndex0: number) => Promise<string>
  onClose: () => void
  t: PdfT
}): ReactNode {
  const maxPage = Math.max(total, 1)
  const current = Math.min(Math.max(page, 1), maxPage)
  const cache = useRef(new Map<number, string>())
  const request = useRef(0)
  const mounted = useRef(true)
  const translateRef = useRef(translate)
  const [view, setView] = useState<TranslationView | undefined>(undefined)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    translateRef.current = translate
  }, [translate])

  useEffect(() => {
    if (!open) {
      request.current += 1
      return
    }
    const token = request.current + 1
    request.current = token
    const pageIndex = current - 1
    const cached = cache.current.get(pageIndex)

    const prefetch = async (): Promise<void> => {
      for (let index = 0; index < total; index += 1) {
        if (!mounted.current || token !== request.current) return
        if (index === pageIndex || cache.current.has(index)) continue
        try {
          const text = await translateRef.current(index)
          if (!mounted.current || token !== request.current) return
          cache.current.set(index, text)
        } catch {
          if (!mounted.current || token !== request.current) return
        }
      }
    }

    if (cached !== undefined) {
      setView({ page: current, text: cached, error: '' })
      void prefetch()
      return
    }

    setView(undefined)
    void translateRef.current(pageIndex).then((text) => {
      if (!mounted.current || token !== request.current) return
      cache.current.set(pageIndex, text)
      setView({ page: current, text, error: '' })
      void prefetch()
    }).catch((error: unknown) => {
      if (!mounted.current || token !== request.current) return
      setView({ page: current, text: '', error: errorMessage(error) })
    })
  }, [open, current, total])

  if (!open) return null

  const loading = view === undefined || view.page !== current

  let body: ReactNode
  if (loading) {
    body = <p className="m-0 text-muted-foreground text-xs">{t('translating')}</p>
  } else if (view.error !== '') {
    body = (
      <p className="m-0 whitespace-pre-wrap text-muted-foreground text-xs">
        {t('translationFailed')} {view.error}
      </p>
    )
  } else if (view.text.trim() === '') {
    body = <p className="m-0 text-muted-foreground text-xs">{t('translationEmpty')}</p>
  } else {
    body = <p className="m-0 whitespace-pre-wrap text-foreground">{view.text}</p>
  }

  return (
    <aside
      data-pdf-chrome
      aria-label={t('translation')}
      className="agentero-scroll absolute inset-y-0 right-0 z-20 flex w-80 min-w-0 flex-col select-text border-border/50 border-s bg-background/90 pt-11 pb-2 shadow-lg backdrop-blur-xl backdrop-saturate-150"
    >
      <div className="flex items-center gap-2 border-border/50 border-b px-3 py-2">
        <Languages className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium text-sm">
          {t('translation')}
          <span className="text-muted-foreground text-xs">{` · ${current}/${maxPage}`}</span>
        </span>
        {loading ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" /> : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t('translation')}
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-3 text-sm leading-relaxed whitespace-pre-wrap">
        {body}
      </div>
    </aside>
  )
}
