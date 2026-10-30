import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Languages, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './button'
import { cn } from './cn'
import { PDF_CHROME_CHIP } from './pdf-chrome-surface'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

type PdfT = PropsLocale<'agentero.pdf'>['t']

/** Top-right chrome: full-text translate. */
export function PdfToolbar({
  translating,
  translateOpen,
  onToggleTranslate,
  t,
}: {
  translating: boolean
  translateOpen: boolean
  onToggleTranslate: () => void
  t: PdfT
}): ReactNode {
  return (
    <div className="absolute top-2 right-3 z-30">
      <TooltipProvider>
        <div
          data-pdf-chrome
          className={cn(
            'flex h-7 items-center gap-0.5 rounded-lg p-0.5',
            PDF_CHROME_CHIP,
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-xs"
                variant={translateOpen ? 'secondary' : 'ghost'}
                aria-pressed={translateOpen}
                aria-label={t('translateAll')}
                onClick={onToggleTranslate}
              >
                {translating ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Languages className="size-3.5" aria-hidden />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('translateAll')}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  )
}
