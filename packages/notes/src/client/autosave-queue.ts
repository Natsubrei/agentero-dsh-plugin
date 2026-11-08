type Writer = (path: string, text: string) => Promise<unknown>
const pendingWrites = new WeakMap<Writer, Map<string, Promise<void>>>()

/** A remounted editor must read after the previous editor's final write. */
export function waitForAutosave(path: string, write: Writer): Promise<void> {
  return pendingWrites.get(write)?.get(path) ?? Promise.resolve()
}

/** A path-bound writer: flush on navigation and serialize requests to prevent stale writes. */
export function createAutosaveQueue(
  path: string,
  write: Writer,
  onResult: (error?: unknown) => void,
  delay = 400,
) {
  let pending: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let chain = Promise.resolve()
  let saved: string | undefined

  function flush(): Promise<void> {
    clearTimeout(timer)
    timer = undefined
    const text = pending
    pending = undefined
    if (text === undefined || path === '') return chain
    const previous = waitForAutosave(path, write)
    chain = Promise.all([chain, previous]).then(async () => {
      if (text === saved) return
      try {
        await write(path, text)
        saved = text
        onResult()
      } catch (error) {
        onResult(error)
      }
    })
    let paths = pendingWrites.get(write)
    if (paths === undefined) {
      paths = new Map()
      pendingWrites.set(write, paths)
    }
    paths.set(path, chain)
    const writing = chain
    void writing.then(() => {
      if (paths.get(path) === writing) paths.delete(path)
    })
    return chain
  }

  return {
    schedule(text: string) {
      pending = text
      clearTimeout(timer)
      timer = setTimeout(() => { void flush() }, delay)
    },
    flush,
  }
}
