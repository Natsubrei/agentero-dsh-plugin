import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { SearchLayer, useSearch } from '@embedpdf/plugin-search/react'
import { useScroll } from '@embedpdf/plugin-scroll/react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from './button'
import { cn } from './cn'
import { PDF_CHROME_CHIP } from './pdf-chrome-surface'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip'

type PdfT = PropsLocale<'agentero.pdf'>['t']

/** How long the query rests before a full-document search is issued. */
const FIND_DEBOUNCE_MS = 250

/** ⌘F / Ctrl+F, without modifiers that would mean a different command. */
function isFindShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'f'
}

/**
 * In-document find (⌘F): the floating query bar, the debounced full-document
 * search, and prev / next navigation that scrolls the focused hit into view.
 *
 * The bar lives inside the PDF host so the shortcut only opens it while the
 * reader is hovered or focused; the hit highlights are rendered separately by
 * {@link PdfSearchLayer} inside each page.
 */
export function PdfFindLayer({
  docId,
  hostRef,
  t,
}: {
  docId: string
  hostRef: RefObject<HTMLDivElement | null>
  t: PdfT
}): ReactNode {
  const { state, provides } = useSearch(docId)
  const scroll = useScroll(docId)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // ⌘F / Ctrl+F opens the bar while the PDF host is hovered or focused.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isFindShortcut(event)) return
      const host = hostRef.current
      if (host === null) return
      if (!host.matches(':hover') && !host.contains(document.activeElement)) return
      event.preventDefault()
      setOpen(true)
      provides?.startSearch()
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hostRef, provides])

  // Debounced full-document search; an empty query just ends the session.
  useEffect(() => {
    const keyword = query.trim()
    if (keyword === '') {
      provides?.stopSearch()
      return undefined
    }
    const timer = window.setTimeout(() => {
      void provides?.searchAllPages(keyword)
    }, FIND_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query, provides])

  const scrollToResult = useCallback(
    (index: number): void => {
      const result = state.results[index]
      if (result === undefined) return
      scroll.provides?.scrollToPage({
        pageNumber: result.pageIndex + 1,
        behavior: 'instant',
      })
    },
    [state.results, scroll.provides],
  )

  const closeFind = useCallback((): void => {
    setOpen(false)
    setQuery('')
    provides?.stopSearch()
  }, [provides])

  // Escape also closes while focus is on one of the bar's buttons.
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeFind()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closeFind])

  if (!open) return null

  const findNext = (): void => {
    if (state.total === 0) return
    scrollToResult(provides?.nextResult() ?? -1)
  }

  const findPrev = (): void => {
    if (state.total === 0) return
    scrollToResult(provides?.previousResult() ?? -1)
  }

  const keyword = query.trim()
  const counter =
    keyword === ''
      ? ''
      : state.total > 0
        ? `${state.activeResultIndex + 1}/${state.total}`
        : t('findNoResults')

  return (
    <TooltipProvider delayDuration={200}>
      <div
        role="search"
        aria-label={t('find')}
        data-pdf-chrome
        className={cn(
          'pointer-events-auto absolute top-12 right-3 z-30 flex origin-top-right select-none items-center gap-1 rounded-lg p-1 shadow-md',
          PDF_CHROME_CHIP,
          'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200 motion-reduce:animate-none',
        )}
      >
        <Search className="ml-1 size-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          className="w-40 select-text bg-transparent text-sm outline-none"
          placeholder={t('findPlaceholder')}
          aria-label={t('find')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (e.shiftKey) findPrev()
              else findNext()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              closeFind()
            }
          }}
        />
        <span className="min-w-11 shrink-0 px-1 text-center text-xs tabular-nums text-muted-foreground">
          {counter}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={t('findPrev')}
              disabled={state.total === 0}
              onClick={findPrev}
            >
              <ChevronUp className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('findPrev')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={t('findNext')}
              disabled={state.total === 0}
              onClick={findNext}
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('findNext')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={t('findClose')}
              onClick={closeFind}
            >
              <X className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('findClose')}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}

/** Hit highlights for the current find query, one layer per rendered page. */
export function PdfSearchLayer({
  docId,
  pageIndex,
}: {
  docId: string
  pageIndex: number
}): ReactNode {
  return (
    <SearchLayer
      documentId={docId}
      pageIndex={pageIndex}
      className="pointer-events-none absolute inset-0 z-[3]"
    />
  )
}
