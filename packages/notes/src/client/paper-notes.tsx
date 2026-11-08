import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useState, type ReactNode } from 'react'
import { useAutosave } from './autosave'
import { waitForAutosave } from './autosave-queue'
import { messageOf } from './messages'
import { PlateNote } from './plate-note'
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
  const [failure, setFailure] = useState('')
  const [loaded, setLoaded] = useState(false)
  const path = paperNotesPath(paperPath)
  const saveMarkdown = useAutosave(path, writeNote, (message) => {
    setFailure(message === '' ? '' : message || t('saveFailed'))
  })

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    setText('')
    setFailure('')
    void waitForAutosave(path, writeNote).then(() => readNote(path)).then((file) => {
      if (cancelled) return
      setText(file.text)
      setLoaded(true)
    }).catch((error: unknown) => {
      if (cancelled) return
      const message = messageOf(error)
      if (message === 'not found') {
        setText('')
        setLoaded(true)
        return
      }
      setFailure(message === '' ? t('readFailed') : message)
    })
    return () => { cancelled = true }
  }, [path, readNote, writeNote, t])

  return (
    <div className={ROOT}>
      {failure === '' ? null : <p className="px-3 pt-2 text-destructive text-sm">{failure}</p>}
      {loaded ? (
        <PlateNote
          key={path}
          markdown={text}
          placeholder={t('paperEmpty')}
          onMarkdown={saveMarkdown}
          t={t}
        />
      ) : null}
    </div>
  )
}
