import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Languages, Pin, PinOff, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from './button'
import { cn } from './cn'
import { PDF_CHROME_CHIP, PDF_FLOAT_CARD } from './pdf-chrome-surface'
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from './tooltip'

type PdfT = PropsLocale<'agentero.pdf'>['t']

const EDGE = 12
const GAP = 8
const CARD_WIDTH = 340
const CARD_MAX_HEIGHT = 320

export interface TranslateCardAnchor {
  x: number
  y: number
}

export interface TranslateCardProps {
  anchor: TranslateCardAnchor
  result: string
  error: string
  loading: boolean
  pinned: boolean
  onTogglePin: () => void
  onClose: () => void
  t: PdfT
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Keep the card next to its selection, flipping left near the viewport edge. */
function placeCard(anchor: TranslateCardAnchor): { left: number, top: number, maxHeight: number } {
  const vw = typeof window === 'undefined' ? 1200 : window.innerWidth
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  const width = Math.min(CARD_WIDTH, Math.max(0, vw - EDGE * 2))
  let left = anchor.x + GAP
  if (left + width > vw - EDGE) left = anchor.x - width - GAP
  left = clamp(left, EDGE, Math.max(EDGE, vw - width - EDGE))
  const top = clamp(anchor.y - 8, EDGE, Math.max(EDGE, vh - EDGE - 120))
  return {
    left,
    top,
    maxHeight: Math.max(120, Math.min(CARD_MAX_HEIGHT, vh - top - EDGE)),
  }
}

/**
 * Selection translation result. Mirrors the motif translate card: a small
 * floating card anchored next to the selected text, with a pin that keeps the
 * result reachable after the card is dismissed.
 */
export function TranslateCard({
  anchor,
  result,
  error,
  loading,
  pinned,
  onTogglePin,
  onClose,
  t,
}: TranslateCardProps): ReactNode {
  const cardRef = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState(() => placeCard(anchor))

  useLayoutEffect(() => {
    setPlace(placeCard(anchor))
  }, [anchor.x, anchor.y])

  useEffect(() => {
    const replace = (): void => { setPlace(placeCard(anchor)) }
    window.addEventListener('resize', replace)
    return () => { window.removeEventListener('resize', replace) }
  }, [anchor.x, anchor.y])

  // Dismiss on Escape or on a pointer press outside the card. The pointerdown
  // that opened the card already happened before this listener mounts.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const node = cardRef.current
      if (node !== null && event.target instanceof Node && node.contains(event.target)) return
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [onClose])

  return (
    <div
      ref={cardRef}
      data-pdf-chrome
      role="dialog"
      aria-label={t('translation')}
      aria-live="polite"
      className={cn(
        'fixed z-50 flex flex-col overflow-hidden text-foreground',
        PDF_FLOAT_CARD,
      )}
      style={{
        left: place.left,
        top: place.top,
        width: `min(${CARD_WIDTH}px, calc(100vw - ${EDGE * 2}px))`,
        maxHeight: place.maxHeight,
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="flex shrink-0 items-center gap-2 border-border/60 border-b px-3 py-2">
        <Languages className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium text-sm">
          {t('translation')}
        </span>
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={pinned ? 'secondary' : 'ghost'}
                size="icon-xs"
                aria-label={pinned ? t('unpin') : t('pin')}
                aria-pressed={pinned}
                onClick={onTogglePin}
              >
                {pinned ? <PinOff /> : <Pin />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {pinned ? t('unpin') : t('pin')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t('close')}
                onClick={onClose}
              >
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('close')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </header>
      <div className="agentero-scroll min-h-0 flex-1 overflow-auto px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
        {loading ? (
          <p className="m-0 text-muted-foreground text-xs">{t('translating')}</p>
        ) : error !== '' ? (
          <p className="m-0 text-destructive text-xs" role="alert">{error}</p>
        ) : (
          <p className="m-0">{result}</p>
        )}
      </div>
    </div>
  )
}

/**
 * Small chip pinned to the selected text on the page itself. It lives inside
 * the page layer, so it scrolls and zooms with the document instead of
 * drifting across the paper when the reader moves.
 *
 * `x` / `y` are fractions (0–1) of the page box.
 */
export function TranslateCardPin({
  x,
  y,
  onOpen,
  t,
}: {
  x: number
  y: number
  onOpen: (screen: TranslateCardAnchor) => void
  t: PdfT
}): ReactNode {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            data-pdf-chrome
            aria-label={t('translation')}
            className={cn('absolute z-[6] -translate-x-full -translate-y-1/2 shadow-sm ring-1 ring-black/5 dark:ring-white/10', PDF_CHROME_CHIP)}
            style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              onOpen({ x: rect.right + 6, y: rect.top })
            }}
          >
            <Languages />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('translation')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
