import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { PaperTagChip, PaperTagRemoveButton } from './paper-tag-chip'
import type { LibraryT, PaperRow } from './papers'
import { Input } from './input'
import { cn, controlReset } from './utils'

export type SortDir = 'asc' | 'desc'

export const COLUMN_ORDER = ['title', 'authors', 'year', 'tags'] as const

export type ColumnKey = (typeof COLUMN_ORDER)[number]

export interface CellCtx {
  t: LibraryT
  busy: boolean
  tagDraft: string
  onTagDraft: (value: string) => void
  onAddTag: (tag: string) => void
  onRemoveTag: (name: string) => void
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
            <span
              key={tag.name}
              className='inline-flex cursor-pointer'
              onClick={(event) => {
                event.stopPropagation()
                if (ctx.busy) return
                const target = event.target
                if (target instanceof Element && target.closest('button')) return
                ctx.onRemoveTag(tag.name)
              }}
            >
              <PaperTagChip
                tag={tag}
                trailing={(
                  <PaperTagRemoveButton
                    tagName={tag.name}
                    label={tag.name}
                    disabled={ctx.busy}
                    onRemove={ctx.onRemoveTag}
                  />
                )}
              />
            </span>
          ))}
          <Input
            value={ctx.tagDraft}
            placeholder={ctx.t('addTag')}
            aria-label={ctx.t('addTag')}
            disabled={ctx.busy}
            className='h-6 w-16 border-transparent bg-muted/70 px-1.5 text-xs shadow-none placeholder:text-muted-foreground/70 focus-visible:border-border/60 focus-visible:bg-card'
            onMouseDown={(event) => { event.stopPropagation() }}
            onClick={(event) => { event.stopPropagation() }}
            onChange={(event) => { ctx.onTagDraft(event.target.value) }}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key !== 'Enter') return
              event.preventDefault()
              const tag = ctx.tagDraft.trim()
              if (tag === '') return
              ctx.onAddTag(tag)
            }}
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
