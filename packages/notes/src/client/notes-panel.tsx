import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FileTree, FileTreeFile } from './file-tree'
import { NoteMarkdown } from './markdown'
import { messageOf, shown } from './messages'
import { NoteEditor, NoteReadView } from './note-chrome'
import { NoteToolbar } from './toolbar'
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
  const [doc, setDoc] = useState<DocStatus>({ kind: 'idle' })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [writeError, setWriteError] = useState<string | undefined>(undefined)
  const ticket = useRef(0)

  useEffect(() => {
    let cancelled = false
    setList({ kind: 'loading' })
    loadNotes()
      .then((notes) => {
        if (!cancelled) setList({ kind: 'ready', notes })
      })
      .catch((error: unknown) => {
        if (!cancelled) setList({ kind: 'error', message: messageOf(error) })
      })
    return () => { cancelled = true }
  }, [loadNotes])

  useEffect(() => {
    const current = ticket.current + 1
    ticket.current = current
    setSaving(false)
    setEditing(false)
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
        setDraft(note.text)
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

  const save = (): void => {
    if (doc.kind !== 'ready' || saving) return
    const current = ticket.current
    const path = doc.path
    const text = draft
    setSaving(true)
    setWriteError(undefined)
    writeNote(path, text)
      .then(async () => {
        if (ticket.current !== current) return
        setDoc({ kind: 'ready', path, text })
        setDraft(text)
        setEditing(false)
        try {
          const notes = await loadNotes()
          if (ticket.current !== current) return
          setList({ kind: 'ready', notes })
        } catch {
          // The file is already saved. Keep the list on screen.
        }
      })
      .catch((error: unknown) => {
        if (ticket.current !== current) return
        setWriteError(messageOf(error))
      })
      .finally(() => {
        if (ticket.current === current) setSaving(false)
      })
  }

  const cancel = (): void => {
    if (doc.kind !== 'ready') return
    setDraft(doc.text)
    setEditing(false)
    setWriteError(undefined)
  }

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
  const listPane = (
    <FileTree
      selectedPath={selected}
      onSelect={setSelected}
      className="flex h-full w-56 shrink-0 flex-col overflow-y-auto border-e border-border py-1"
    >
      {notes.length === 0 ? (
        <p className="px-4 py-2 text-muted-foreground text-sm">{t('empty')}</p>
      ) : notes.map((note) => (
        <FileTreeFile key={note.path} path={note.path} name={note.title} title={note.path} />
      ))}
    </FileTree>
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
        <NoteToolbar
          editing={editing}
          busy={saving}
          editLabel={t('edit')}
          saveLabel={t('save')}
          cancelLabel={t('cancel')}
          onEdit={() => {
            setDraft(doc.text)
            setWriteError(undefined)
            setEditing(true)
          }}
          onSave={save}
          onCancel={cancel}
        />
        {writeError === undefined ? null : (
          <p className="px-3 pt-2 text-destructive text-sm">{shown(writeError, t('saveFailed'), t)}</p>
        )}
        {editing ? (
          <NoteEditor value={draft} label={t('edit')} onChange={setDraft} />
        ) : (
          <NoteReadView>
            <NoteMarkdown text={doc.text} />
          </NoteReadView>
        )}
      </>
    )
  }

  return (
    <div className={ROOT}>
      {listPane}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{reader}</div>
    </div>
  )
}
