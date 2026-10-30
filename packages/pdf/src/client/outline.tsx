/**
 * PDF outline (bookmarks) layer: the top-left toolbar chip that opens the
 * outline panel, plus its inline-editable tree.
 *
 * The panel owns only its draft tree. Loading comes from the bookmark plugin
 * capability and every add / rename / delete is persisted by the parent via
 * `onSave`, which writes the outline back into the PDF.
 */

import { useBookmarkCapability } from '@embedpdf/plugin-bookmark/react'
import type { PdfBookmarkObject } from '@embedpdf/models'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { List, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  bookmarkPageIndex,
  type EditableBookmark,
  editableBookmarks,
  removeBookmark,
  updateBookmark,
} from './bookmark'
import { Button } from './button'
import { cn } from './cn'
import { PDF_CHROME_CHIP, PDF_SIDE_PANEL } from './pdf-chrome-surface'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip'

type PdfT = PropsLocale<'agentero.pdf'>['t']

type PdfOutlineLayerProps = {
  docId: string
  /** One-based current page, used when adding a bookmark. */
  currentPage: number
  /** One-based page navigation, handled by the parent's scroller. */
  onGoToPage: (page: number) => void
  /** Persist the whole outline; the parent writes it back into the PDF. */
  onSave: (nodes: EditableBookmark[]) => Promise<void>
  t: PdfT
}

/** Top-left outline toggle + inline-editable outline panel. */
export function PdfOutlineLayer({
  docId,
  currentPage,
  onGoToPage,
  onSave,
  t,
}: PdfOutlineLayerProps): ReactNode {
  const { provides } = useBookmarkCapability()
  const [open, setOpen] = useState(false)
  const [outline, setOutline] = useState<PdfBookmarkObject[]>([])
  const [nodes, setNodes] = useState<EditableBookmark[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const savingRef = useRef(false)

  // Load the document outline whenever the panel opens or the document changes.
  useEffect(() => {
    if (!open || !provides) return undefined
    let cancelled = false
    setLoaded(false)
    void provides
      .forDocument(docId)
      .getBookmarks()
      .toPromise()
      .then((res) => {
        if (cancelled) return
        const bookmarks = res.bookmarks ?? []
        setOutline(bookmarks)
        setNodes(editableBookmarks(bookmarks))
        setLoaded(true)
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [open, provides, docId])

  const commit = (next: EditableBookmark[]): void => {
    if (savingRef.current) return
    savingRef.current = true
    setEditingId(null)
    setNodes(next)
    setSaving(true)
    setFailed(false)
    void onSave(next)
      .catch(() => {
        setFailed(true)
      })
      .finally(() => {
        savingRef.current = false
        setSaving(false)
      })
  }

  const add = (): void => {
    const node: EditableBookmark = {
      id: crypto.randomUUID(),
      origin: null,
      title: t('bookmarkPageTitle', { page: currentPage }),
      pageIndex: currentPage - 1,
      children: [],
    }
    commit([...nodes, node])
  }

  const rename = (id: string, title: string): void => {
    const nextTitle = title.trim()
    setEditingId(null)
    if (nextTitle === '') return
    commit(
      updateBookmark(nodes, id, (node) => ({ ...node, title: nextTitle })),
    )
  }

  return (
    <>
      <div className="absolute top-2 left-3 z-30">
        <TooltipProvider delayDuration={200}>
          <div
            data-pdf-chrome
            className={cn(
              'flex h-7 select-none items-center gap-0.5 rounded-lg p-0.5',
              PDF_CHROME_CHIP,
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant={open ? 'secondary' : 'ghost'}
                  aria-label={t('outline')}
                  aria-pressed={open}
                  onClick={() => setOpen((value) => !value)}
                >
                  <List className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('outline')}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </div>

      {open ? (
        <aside
          data-pdf-chrome
          aria-label={t('outline')}
          className={cn(
            'agentero-scroll',
            PDF_SIDE_PANEL,
            'absolute top-12 bottom-auto left-3 z-20 max-h-[calc(100%-5rem)] w-64 overflow-auto rounded-lg p-1.5',
          )}
        >
          <div className="flex items-center justify-between gap-1 px-2 py-1">
            <span className="truncate font-medium text-muted-foreground text-xs">
              {t('outline')}
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
              {saving ? (
                <Loader2
                  className="size-3.5 animate-spin motion-reduce:animate-none"
                  aria-label={t('bookmarkSaving')}
                />
              ) : null}
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="text-muted-foreground"
                aria-label={t('bookmarkAdd')}
                title={t('bookmarkAdd')}
                disabled={saving}
                onClick={add}
              >
                <Plus className="size-3.5" />
              </Button>
            </span>
          </div>

          {nodes.length > 0 ? (
            <OutlineRows
              nodes={nodes}
              depth={0}
              editingId={editingId}
              disabled={saving}
              onGoToPage={onGoToPage}
              onStartRename={setEditingId}
              onRename={rename}
              onCancelRename={() => setEditingId(null)}
              onDelete={(id) => commit(removeBookmark(nodes, id))}
              t={t}
            />
          ) : loaded && outline.length === 0 ? (
            <p className="px-2 py-3 text-muted-foreground text-xs">
              {t('outlineEmpty')}
            </p>
          ) : null}

          {failed ? (
            <p className="px-2 py-1 text-destructive text-xs" role="alert">
              {t('bookmarkFailed')}
            </p>
          ) : null}
        </aside>
      ) : null}
    </>
  )
}

type OutlineRowsProps = {
  nodes: EditableBookmark[]
  depth: number
  editingId: string | null
  disabled: boolean
  onGoToPage: (page: number) => void
  onStartRename: (id: string) => void
  onRename: (id: string, title: string) => void
  onCancelRename: () => void
  onDelete: (id: string) => void
  t: PdfT
}

/** Recursive outline list: indent by depth, inline rename, delete. */
function OutlineRows({
  nodes,
  depth,
  editingId,
  disabled,
  onGoToPage,
  onStartRename,
  onRename,
  onCancelRename,
  onDelete,
  t,
}: OutlineRowsProps): ReactNode {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        const pageIndex = node.pageIndex ?? bookmarkPageIndex(node)
        return (
          <li key={node.id}>
            {editingId === node.id ? (
              <div style={{ paddingLeft: 8 + depth * 12 }}>
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- the row just entered edit mode
                  autoFocus
                  defaultValue={node.title}
                  aria-label={t('bookmarkRename')}
                  className="w-full select-text rounded bg-muted px-1.5 py-1 text-sm text-foreground outline-none ring-1 ring-ring/40"
                  onFocus={(event) => event.currentTarget.select()}
                  onBlur={(event) => {
                    if (event.currentTarget.value !== node.title) {
                      onRename(node.id, event.currentTarget.value)
                    } else {
                      onCancelRename()
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      event.currentTarget.blur()
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      onCancelRename()
                    }
                  }}
                />
              </div>
            ) : (
              <div className="group flex items-center gap-0.5">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-muted-foreground text-sm transition-colors duration-100 hover:bg-muted/60 hover:text-foreground active:bg-muted/80"
                  style={{ paddingLeft: 8 + depth * 12 }}
                  title={node.title}
                  onClick={() => {
                    if (pageIndex != null) onGoToPage(pageIndex + 1)
                  }}
                >
                  {node.title}
                </button>
                <span className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="size-5 text-muted-foreground"
                    aria-label={t('bookmarkRename')}
                    title={t('bookmarkRename')}
                    disabled={disabled}
                    onClick={() => onStartRename(node.id)}
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="size-5 text-muted-foreground"
                    aria-label={t('bookmarkDelete')}
                    title={t('bookmarkDelete')}
                    disabled={disabled}
                    onClick={() => onDelete(node.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </span>
              </div>
            )}
            {node.children.length > 0 ? (
              <OutlineRows
                nodes={node.children}
                depth={depth + 1}
                editingId={editingId}
                disabled={disabled}
                onGoToPage={onGoToPage}
                onStartRename={onStartRename}
                onRename={onRename}
                onCancelRename={onCancelRename}
                onDelete={onDelete}
                t={t}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
