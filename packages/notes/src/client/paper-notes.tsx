import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useState, type ReactNode } from 'react'
import { EmptyNote, NoteMarkdown } from './markdown'
import { messageOf } from './messages'
import { NoteEditor, NoteReadView } from './note-chrome'
import { NoteToolbar } from './toolbar'
import type { NotesFace } from './types'

const ROOT = 'agentero-notes agentero-surface box-border flex h-full min-h-0 min-w-0 flex-col overflow-hidden font-sans [&_*]:box-border'

function paperNotesPath(paperPath: string): string {
  const normalized = paperPath.replaceAll('\\', '/').replace(/\/+$/, '')
  return `${normalized}/NOTES.md`
}

export function PaperNotes({
  paperPath, t, readNote, writeNote,
}: PropsRuntime<'agentero.pdf.notes'> & PropsLocale<'agentero.notes'> & Pick<NotesFace, 'readNote' | 'writeNote'>): ReactNode {
  const [text, setText] = useState('')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const path = paperNotesPath(paperPath)

  useEffect(() => {
    let cancelled = false
    setEditing(false)
    setFailure('')
    setBusy(true)
    void readNote(path).then((file) => {
      if (cancelled) return
      setText(file.text)
      setDraft(file.text)
    }).catch((error: unknown) => {
      if (cancelled) return
      const message = messageOf(error)
      if (message === 'not found') {
        setText('')
        setDraft('')
        return
      }
      setFailure(message === '' ? t('readFailed') : message)
    }).finally(() => {
      if (!cancelled) setBusy(false)
    })
    return () => { cancelled = true }
  }, [path, readNote, t])

  const save = (): void => {
    setBusy(true)
    setFailure('')
    void writeNote(path, draft).then(() => {
      setText(draft)
      setEditing(false)
    }).catch((error: unknown) => {
      const message = messageOf(error)
      setFailure(message === '' ? t('saveFailed') : message)
    }).finally(() => { setBusy(false) })
  }

  const body = editing
    ? <NoteEditor value={draft} label={t('edit')} onChange={setDraft} />
    : (
      <NoteReadView>
        {text.trim() === '' ? <EmptyNote>{t('paperEmpty')}</EmptyNote> : <NoteMarkdown text={text} />}
      </NoteReadView>
    )

  return (
    <div className={ROOT}>
      <NoteToolbar
        editing={editing}
        busy={busy}
        editLabel={t('edit')}
        saveLabel={t('save')}
        cancelLabel={t('cancel')}
        onEdit={() => { setDraft(text); setEditing(true) }}
        onSave={save}
        onCancel={() => { setDraft(text); setEditing(false) }}
      />
      {failure === '' ? null : <p className="px-3 pt-2 text-destructive text-sm">{failure}</p>}
      {body}
    </div>
  )
}
