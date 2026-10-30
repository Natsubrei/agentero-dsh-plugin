import { useEffect, useRef } from 'react'
import { messageOf } from './messages'

/** Writes markdown after a short pause. Callers only pass text the user changed. */
export function useAutosave(
  path: string,
  write: (path: string, text: string) => Promise<unknown>,
  onError: (message: string) => void,
): (markdown: string) => void {
  const writeRef = useRef(write)
  const onErrorRef = useRef(onError)
  const saved = useRef<string | null>(null)
  const timer = useRef(0)
  const generation = useRef(0)

  writeRef.current = write
  onErrorRef.current = onError

  useEffect(() => {
    generation.current += 1
    saved.current = null
    window.clearTimeout(timer.current)
    return () => { window.clearTimeout(timer.current) }
  }, [path])

  return (markdown: string) => {
    if (markdown === saved.current) return
    const current = generation.current
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void writeRef.current(path, markdown).then(() => {
        if (generation.current !== current) return
        saved.current = markdown
        onErrorRef.current('')
      }).catch((error: unknown) => {
        if (generation.current !== current) return
        onErrorRef.current(messageOf(error))
      })
    }, 400)
  }
}
