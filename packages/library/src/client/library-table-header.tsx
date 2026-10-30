import { Search } from 'lucide-react'
import { COLUMN_META, COLUMN_ORDER, SortIcon, type ColumnKey, type SortDir } from './library-columns'
import { Input } from './input'
import type { LibraryT } from './papers'
import { cn, controlReset } from './utils'

type LibraryTableHeaderProps = {
  t: LibraryT
  sortKey: ColumnKey
  sortDir: SortDir
  onSort: (key: ColumnKey) => void
  inputValue: string
  onInputChange: (value: string) => void
}

export function LibraryTableHeader({
  t,
  sortKey,
  sortDir,
  onSort,
  inputValue,
  onInputChange,
}: LibraryTableHeaderProps) {
  return (
    <thead
      data-library-header
      className='sticky top-0 z-[1] select-none border-b border-transparent bg-background/72 shadow-[0_1px_0_0_color-mix(in_oklch,var(--border)_55%,transparent)] backdrop-blur-xl backdrop-saturate-150 supports-backdrop-blur:bg-background/60'
    >
      <tr className='text-xs tracking-wide text-muted-foreground'>
        {COLUMN_ORDER.map(key => {
          const meta = COLUMN_META[key]
          const active = sortKey === key
          return (
            <th
              key={key}
              className={cn(meta.headerClassName, 'relative p-0 font-medium')}
              aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <div className='flex h-9 min-w-0 items-center gap-1 px-3'>
                <button
                  type='button'
                  className={cn(
                    controlReset,
                    'flex min-w-0 shrink cursor-grab items-center gap-1 py-0.5 text-left',
                    'hover:text-foreground active:cursor-grabbing',
                    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    active && 'text-foreground',
                  )}
                  onClick={() => { onSort(key) }}
                  aria-label={t(meta.labelKey)}
                >
                  <span className='truncate'>{t(meta.labelKey)}</span>
                  <SortIcon active={active} dir={sortDir} />
                </button>
                {key === 'title' ? (
                  <div className='relative ml-1 min-w-0 flex-1'>
                    <Search
                      className='pointer-events-none absolute top-1/2 left-1.5 size-3 -translate-y-1/2 text-muted-foreground'
                      aria-hidden
                    />
                    <Input
                      type='search'
                      value={inputValue}
                      onChange={(event) => { onInputChange(event.target.value) }}
                      aria-label={t('filter')}
                      placeholder={t('filter')}
                      className='h-6 border-transparent bg-muted/70 pr-1.5 pl-6 text-xs shadow-none placeholder:text-muted-foreground/70 focus-visible:border-border/60 focus-visible:bg-card'
                      onMouseDown={(event) => { event.stopPropagation() }}
                      onClick={(event) => { event.stopPropagation() }}
                      onKeyDown={(event) => { event.stopPropagation() }}
                    />
                  </div>
                ) : null}
              </div>
            </th>
          )
        })}
        <th className='w-16 min-w-16 p-0'>
          <div className='h-9' />
        </th>
      </tr>
    </thead>
  )
}
