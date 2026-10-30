import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { PaperTagChip, PaperTagRemoveButton } from './paper-tag-chip'
import type { LibraryT, PaperRow } from './papers'
import { TagComposer } from './tag-composer'
import { cn, controlReset } from './utils'

export type SortDir = 'asc' | 'desc'

export const COLUMN_ORDER = ['title', 'authors', 'year', 'tags'] as const

export type ColumnKey = (typeof COLUMN_ORDER)[number]

export interface CellCtx {
  t: LibraryT
  busy: boolean
  /** Resolves true when the tag was written, so the composer keeps its draft on failure. */
  onAddTag: (ref: string, tag: string) => Promise<boolean>
  onRemoveTag: (ref: string, name: string) => void
}

interface ColumnDef {
  labelKey: 'colTitle' | 'colAuthors' | 'colYear' | 'colTags'
  headerClassName: string
  render: (paper: PaperRow, ctx: CellCtx) => ReactNode
}

export function SortIcon({ active, dir }: { active: boolean, dir: SortDir }) {
  if (!active) {
    return <ArrowUpDown className='size-3 shrink-0 opacity-40' aria-hidden />
  }
  return dir === 'asc' ? (
    <ArrowUp className='size-3 shrink-0 text-foreground' aria-hidden />
  ) : (
    <ArrowDown className='size-3 shrink-0 text-foreground' aria-hidden />
  )
}

export const COLUMN_META: Record<ColumnKey, ColumnDef> = {
  title: {
    labelKey: 'colTitle',
    headerClassName: 'min-w-[240px]',
    render: (paper) => (
      <td className='min-w-0 max-w-0 overflow-hidden px-3 py-2.5'>
        <span className='block w-full min-w-0 truncate text-left font-medium'>
          {paper.title || '—'}
        </span>
      </td>
    ),
  },
  authors: {
    labelKey: 'colAuthors',
    headerClassName: 'min-w-[140px]',
    render: (paper) => (
      <td className='min-w-0 max-w-0 overflow-hidden px-3 py-2.5 text-xs text-muted-foreground'>
        <span className='block truncate' title={paper.authors || undefined}>
          {paper.authors || '—'}
        </span>
      </td>
    ),
  },
  year: {
    labelKey: 'colYear',
    headerClassName: 'min-w-[92px]',
    render: (paper) => (
      <td className='whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-muted-foreground'>
        {paper.year || '—'}
      </td>
    ),
  },
  tags: {
    labelKey: 'colTags',
    headerClassName: 'min-w-[120px]',
    render: (paper, ctx) => (
      <td className='min-w-0 max-w-0 overflow-hidden px-3 py-2.5'>
        <div className='flex flex-wrap items-center gap-1'>
          {paper.tags.map(tag => (
            <PaperTagChip
              key={tag.name}
              tag={tag}
              trailing={(
                <PaperTagRemoveButton
                  tagName={tag.name}
                  label={`${ctx.t('removeTag')} ${tag.name}`}
                  disabled={ctx.busy}
                  onRemove={(name) => { ctx.onRemoveTag(paper.openId, name) }}
                />
              )}
            />
          ))}
          <TagComposer
            label={ctx.t('addTag')}
            disabled={ctx.busy}
            onAdd={(tag) => ctx.onAddTag(paper.openId, tag)}
          />
        </div>
      </td>
    ),
  },
}

export function sortValue(paper: PaperRow, key: ColumnKey): string {
  if (key === 'tags') return paper.tags.map(tag => tag.name).join(', ')
  return paper[key]
}

export function controlButtonClass(extra?: string): string {
  return cn(
    controlReset,
    'flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground',
    'hover:bg-muted/60 hover:text-foreground',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    extra,
  )
}
