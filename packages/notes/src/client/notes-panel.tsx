import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { PanelRight, PanelRightClose } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAutosave } from './autosave'
import { FileTree, FileTreeFile } from './file-tree'
import { messageOf, shown } from './messages'
import { PlateNote } from './plate-note'
import type { NoteListItem, NotesFace } from './types'

const ROOT = 'agentero-notes agentero-surface box-border flex h-full min-h-0 min-w-0 overflow-hidden font-sans [&_*]:box-border'
const STATUS = 'flex flex-1 items-center justify-center p-4 text-center text-muted-foreground text-sm'

export function NotesArtwork({ size = 36, className }: { size?: number, className?: string }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden
    >
      <path d="M12 8h8l6 6v14a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" stroke="#C4B5FD" strokeWidth={2} />
      <path d="M20 8v6h6M14 20h8M14 24h5" stroke="#C4B5FD" strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

type ListStatus =
  | { kind: 'loading' }
  | { kind: 'error', message: string }
  | { kind: 'ready', notes: NoteListItem[] }

type DocStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error', message: string }
  | { kind: 'ready', path: string, text: string }

export function NotesPanel({
  t, loadNotes, readNote, writeNote,
}: PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'agentero.notes'> & NotesFace): ReactNode {
  const [list, setList] = useState<ListStatus>({ kind: 'loading' })
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [listOpen, setListOpen] = useState(false)
  const [doc, setDoc] = useState<DocStatus>({ kind: 'idle' })
  const [writeError, setWriteError] = useState<string | undefined>(undefined)
  const ticket = useRef(0)
  const saveMarkdown = useAutosave(doc.kind === 'ready' ? doc.path : '', writeNote, (message) => {
    setWriteError(message === '' ? undefined : message)
  })

  useEffect(() => {
    let cancelled = false
    setList({ kind: 'loading' })
    loadNotes()
      .then((notes) => {
        if (cancelled) return
        setList({ kind: 'ready', notes })
        setSelected((current) => current ?? notes[0]?.path)
      })
      .catch((error: unknown) => {
        if (!cancelled) setList({ kind: 'error', message: messageOf(error) })
      })
    return () => { cancelled = true }
  }, [loadNotes])

  useEffect(() => {
    const current = ticket.current + 1
    ticket.current = current
    setWriteError(undefined)
    if (selected === undefined) {
      setDoc({ kind: 'idle' })
      return
    }
    let cancelled = false
    setDoc({ kind: 'loading' })
    readNote(selected)
      .then((note) => {
        if (cancelled || ticket.current !== current) return
        setDoc({ kind: 'ready', path: note.path, text: note.text })
      })
      .catch((error: unknown) => {
        if (cancelled || ticket.current !== current) return
        setDoc({ kind: 'error', message: messageOf(error) })
      })
    return () => {
      cancelled = true
      ticket.current += 1
    }
  }, [selected, readNote])

  if (list.kind === 'loading') {
    return (
      <div className={ROOT}>
        <p className={STATUS}>{t('loading')}</p>
      </div>
    )
  }
  if (list.kind === 'error') {
    return (
      <div className={ROOT}>
        <p className={STATUS}>{shown(list.message, t('loadFailed'), t)}</p>
      </div>
    )
  }

  const notes = list.notes
  const listToggle = (
    <button
      type="button"
      aria-label={listOpen ? t('collapseList') : t('expandList')}
      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground"
      onClick={() => { setListOpen((open) => !open) }}
    >
      {listOpen ? <PanelRightClose className="size-3.5" /> : <PanelRight className="size-3.5" />}
    </button>
  )
  const listPane = (
    <div className="flex h-full w-52 shrink-0 flex-col border-s border-border">
      <FileTree
        selectedPath={selected}
        onSelect={setSelected}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1"
      >
        {notes.length === 0 ? (
          <p className="px-4 py-2 text-muted-foreground text-sm">{t('empty')}</p>
        ) : notes.map((note) => (
          <FileTreeFile key={note.path} path={note.path} name={note.title} title={note.path} />
        ))}
      </FileTree>
    </div>
  )

  let reader: ReactNode
  if (selected === undefined || doc.kind === 'idle') {
    reader = <p className={STATUS}>{notes.length === 0 ? '' : t('select')}</p>
  } else if (doc.kind === 'loading') {
    reader = <p className={STATUS}>{t('loading')}</p>
  } else if (doc.kind === 'error') {
    reader = <p className={STATUS}>{shown(doc.message, t('readFailed'), t)}</p>
  } else {
    reader = (
      <>
        {writeError === undefined ? null : (
          <p className="px-3 pt-2 text-destructive text-sm">{shown(writeError, t('saveFailed'), t)}</p>
        )}
        <PlateNote
          key={doc.path}
          markdown={doc.text}
          trailing={listToggle}
          aside={listOpen ? listPane : null}
          onMarkdown={saveMarkdown}
          t={t}
        />
      </>
    )
  }

  const fallback = (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center justify-end border-b border-border pe-1">{listToggle}</div>
        {reader}
      </div>
      {listOpen ? listPane : null}
    </div>
  )

  return (
    <div className={ROOT}>
      {doc.kind === 'ready' ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{reader}</div>
      ) : fallback}
    </div>
  )
}
