import { useEffect, useMemo, useRef } from 'react'
import { createAutosaveQueue } from './autosave-queue'
import { messageOf } from './messages'

/** Save user edits after a pause; flush the original document when leaving it. */
export function useAutosave(
  path: string,
  write: (path: string, text: string) => Promise<unknown>,
  onError: (message: string) => void,
): (markdown: string) => void {
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const active = useRef<object | undefined>(undefined)
  const queue = useMemo(() => {
    const writer = createAutosaveQueue(path, write, (error) => {
      if (active.current !== writer) return
      onErrorRef.current(error === undefined ? '' : messageOf(error))
    })
    return writer
  }, [path, write])

  useEffect(() => {
    active.current = queue
    return () => {
      active.current = undefined
      void queue.flush()
    }
  }, [queue])

  return queue.schedule
}
