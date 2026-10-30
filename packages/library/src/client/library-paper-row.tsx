import { Download, Trash2 } from 'lucide-react'
import { Fragment, memo, type KeyboardEvent, type MouseEvent } from 'react'
import {
  COLUMN_META,
  COLUMN_ORDER,
  controlButtonClass,
  type CellCtx,
} from './library-columns'
import type { PaperRow } from './papers'

type LibraryPaperRowProps = {
  paper: PaperRow
  ctx: CellCtx
  busy: boolean
  /** Handlers take the row's ref so the panel can keep one stable identity per action. */
  onOpen: (ref: string) => void
  onDownload: (ref: string) => void
  onDelete: (ref: string) => void
}

function ignoresRowOpen(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, input') !== null
}

/**
 * One catalog row. Memoized: the panel re-renders on every filter keystroke, and
 * without this each one rebuilt all rows and their tag inputs.
 */
export const LibraryPaperRow = memo(function LibraryPaperRow({
  paper,
  ctx,
  busy,
  onOpen,
  onDownload,
  onDelete,
}: LibraryPaperRowProps) {
  const open = (): void => { onOpen(paper.openId) }

  return (
    <tr
      className='cursor-pointer border-b border-border/40 transition-colors duration-100 hover:bg-accent/70 active:bg-accent'
      tabIndex={0}
      onClick={(event: MouseEvent<HTMLTableRowElement>) => {
        if (ignoresRowOpen(event.target)) return
        open()
      }}
      onKeyDown={(event: KeyboardEvent<HTMLTableRowElement>) => {
        if (event.target !== event.currentTarget) return
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        open()
      }}
    >
      {COLUMN_ORDER.map(key => (
        <Fragment key={key}>
          {COLUMN_META[key].render(paper, ctx)}
        </Fragment>
      ))}
      <td className='w-16 min-w-16 px-2 py-2'>
        <div className='flex items-center justify-end gap-0.5'>
          <button
            type='button'
            className={controlButtonClass()}
            aria-label={ctx.t('download')}
            title={ctx.t('download')}
            disabled={busy}
            onClick={() => { onDownload(paper.openId) }}
          >
            <Download className='size-3.5' aria-hidden />
          </button>
          <button
            type='button'
            className={controlButtonClass('hover:bg-destructive/10 hover:text-destructive')}
            aria-label={ctx.t('deletePaper')}
            title={ctx.t('deletePaper')}
            disabled={busy}
            onClick={() => {
              if (!window.confirm(ctx.t('confirmDelete'))) return
              onDelete(paper.openId)
            }}
          >
            <Trash2 className='size-3.5' aria-hidden />
          </button>
        </div>
      </td>
    </tr>
  )
})
