import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChangeEvent, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from './button'
import { Input } from './input'
import {
  sortValue,
  type CellCtx,
  type ColumnKey,
  type SortDir,
} from './library-columns'
import { LibraryPaperRow } from './library-paper-row'
import { LibraryTableHeader } from './library-table-header'
import {
  papersFrom,
  shown,
  type LibraryFace,
  type PaperRow,
} from './papers'

type LibraryPanelProps =
  PropsRuntime<'sidebar.right.pane.tab'> &
  PropsLocale<'agentero.library'> &
  LibraryFace

function compareRows(a: PaperRow, b: PaperRow, key: ColumnKey, dir: SortDir): number {
  let cmp = sortValue(a, key).localeCompare(sortValue(b, key), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
  if (cmp === 0) cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  if (cmp === 0) cmp = a.openId.localeCompare(b.openId)
  return dir === 'asc' ? cmp : -cmp
}

function defaultSortDir(key: ColumnKey): SortDir {
  return key === 'year' ? 'desc' : 'asc'
}

export function LibraryPanel({
  t,
  loadPapers,
  openPaper,
  importId,
  importBib,
  exportBib,
  discover,
  addTag,
  removeTag,
  deletePaper,
  download,
}: LibraryPanelProps): ReactNode {
  const [status, setStatus] = useState<
    { kind: 'loading' } | { kind: 'error', message: string } | { kind: 'ready', papers: PaperRow[] }
  >({ kind: 'loading' })
  const [query, setQuery] = useState('')
  const [pdfMissing, setPdfMissing] = useState(false)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState('')
  const [importText, setImportText] = useState('')
  const [keyword, setKeyword] = useState('')
  const [found, setFound] = useState<{ id: string, title: string }[]>([])
  const [tagDraft, setTagDraft] = useState<Record<string, string>>({})
  const [sortKey, setSortKey] = useState<ColumnKey>('title')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    let cancelled = false
    setStatus({ kind: 'loading' })
    loadPapers()
      .then((body) => {
        if (cancelled) return
        setStatus({ kind: 'ready', papers: papersFrom(body) })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        setStatus({ kind: 'error', message })
      })
    return () => { cancelled = true }
  }, [loadPapers, revision])

  const papers = status.kind === 'ready' ? status.papers : []
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matched = needle === ''
      ? papers
      : papers.filter(paper =>
        paper.title.toLowerCase().includes(needle) || paper.authors.toLowerCase().includes(needle))
    const copy = [...matched]
    copy.sort((a, b) => compareRows(a, b, sortKey, sortDir))
    return copy
  }, [papers, query, sortKey, sortDir])

  const run = (action: () => Promise<void>): void => {
    setBusy(true)
    setBanner('')
    void action().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : ''
      setBanner(shown(message, t))
    }).finally(() => { setBusy(false) })
  }

  const reload = (): void => { setRevision(value => value + 1) }

  const importCurrent = (): void => {
    const text = importText.trim()
    if (text === '') return
    run(async () => {
      await importId(text)
      setImportText('')
      reload()
    })
  }

  const onSort = (key: ColumnKey): void => {
    if (key === sortKey) {
      setSortDir(dir => dir === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(key)
    setSortDir(defaultSortDir(key))
  }

  let body: ReactNode
  if (status.kind === 'loading') {
    body = (
      <div className='flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground'>
        {t('loading')}
      </div>
    )
  } else if (status.kind === 'error') {
    body = (
      <div className='flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground'>
        {status.message === '' ? t('loadFailed') : shown(status.message, t)}
      </div>
    )
  } else {
    body = (
      <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
        {pdfMissing ? (
          <p className='px-3 py-2 text-xs text-muted-foreground'>{t('pdfDisabled')}</p>
        ) : null}
        <div className='min-w-0'>
          <table className='w-full min-w-[42rem] table-fixed border-collapse text-left text-sm'>
            <colgroup>
              <col style={{ width: '34%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <LibraryTableHeader
              t={t}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
              inputValue={query}
              onInputChange={setQuery}
            />
            <tbody>
              {filtered.map(paper => {
                const ctx: CellCtx = {
                  t,
                  busy,
                  tagDraft: tagDraft[paper.openId] ?? '',
                  onTagDraft: (value) => {
                    setTagDraft(current => ({ ...current, [paper.openId]: value }))
                  },
                  onAddTag: (tag) => {
                    run(async () => {
                      await addTag(paper.openId, tag)
                      setTagDraft(current => ({ ...current, [paper.openId]: '' }))
                      reload()
                    })
                  },
                  onRemoveTag: (name) => {
                    run(async () => {
                      await removeTag(paper.openId, name)
                      reload()
                    })
                  },
                }
                return (
                  <LibraryPaperRow
                    key={paper.key}
                    paper={paper}
                    ctx={ctx}
                    busy={busy}
                    onOpen={(openId) => { setPdfMissing(!openPaper(openId)) }}
                    onDownload={() => {
                      run(async () => { await download(paper.openId) })
                    }}
                    onDelete={() => {
                      run(async () => {
                        await deletePaper(paper.openId)
                        reload()
                      })
                    }}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center'>
            <p className='text-sm font-medium'>
              {papers.length === 0 ? t('empty') : t('noMatches')}
            </p>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className='agentero-library agentero-surface box-border flex h-full min-h-0 min-w-0 w-full flex-col overflow-auto'>
      <div className='flex flex-wrap items-center gap-1.5 border-b border-border/40 px-3 py-2'>
        <Input
          value={importText}
          placeholder={t('importPlaceholder')}
          aria-label={t('importPlaceholder')}
          className='h-7 w-44 text-xs'
          onChange={(event) => { setImportText(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            importCurrent()
          }}
        />
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={busy || importText.trim() === ''}
          onClick={importCurrent}
        >
          {t('importAction')}
        </Button>
        <Input
          value={keyword}
          placeholder={t('discoverPlaceholder')}
          aria-label={t('discoverPlaceholder')}
          className='h-7 w-32 text-xs'
          onChange={(event) => { setKeyword(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || keyword.trim() === '') return
            run(async () => { setFound(await discover(keyword.trim())) })
          }}
        />
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={busy || keyword.trim() === ''}
          onClick={() => {
            run(async () => { setFound(await discover(keyword.trim())) })
          }}
        >
          {t('discoverAction')}
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={busy}
          onClick={() => {
            run(async () => {
              const text = await exportBib()
              const blob = new Blob([text], { type: 'application/x-bibtex' })
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = 'library.bib'
              link.click()
              URL.revokeObjectURL(url)
            })
          }}
        >
          {t('exportBib')}
        </Button>
        <Button
          variant='outline'
          size='sm'
          asChild
          className={busy ? 'pointer-events-none opacity-50' : undefined}
        >
          <label>
            <input
              type='file'
              accept='.bib,.bibtex,text/plain'
              hidden
              disabled={busy}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file === undefined) return
                run(async () => {
                  await importBib(await file.text())
                  reload()
                })
              }}
            />
            {t('importBib')}
          </label>
        </Button>
      </div>
      {banner === '' ? null : (
        <p className='px-3 py-2 text-xs text-destructive'>{banner}</p>
      )}
      {found.length === 0 ? null : (
        <div className='flex flex-wrap gap-1.5 border-b border-border/40 px-3 py-2'>
          {found.map(item => (
            <Button
              key={item.id}
              type='button'
              variant='outline'
              size='sm'
              disabled={busy}
              className='max-w-full'
              onClick={() => {
                run(async () => {
                  await importId(item.id)
                  setFound(current => current.filter(row => row.id !== item.id))
                  reload()
                })
              }}
            >
              <span className='max-w-64 truncate'>{item.title}</span>
            </Button>
          ))}
        </div>
      )}
      {body}
    </div>
  )
}
