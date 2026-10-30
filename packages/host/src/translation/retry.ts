import { setTimeout } from 'node:timers/promises'

/** Only transient failures benefit from repeating the same model request. */
export function isRetryableTranslationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const details = error as Error & { status?: number, statusCode?: number, code?: string }
  if (details.code === 'TRANSLATION_INCOMPLETE' || error.name === 'AbortError') return false
  const status = details.status ?? details.statusCode
  if (status !== undefined) return status === 408 || status === 429 || status >= 500
  if (/unauthorized|forbidden|api.?key|credentials|unexpected argument|not found|configuration/i.test(error.message)) return false
  return error.name === 'TimeoutError' || /timeout|timed out|network|fetch failed|connection|ECONN|ETIMEDOUT|rate.?limit|\b429\b|\b5\d\d\b|overloaded|unavailable|stream ended before completion|returned no translation/i.test(error.message)
}

export async function retryTranslation<T>(
  call: () => Promise<T>, signal: AbortSignal,
  wait: (ms: number, signal: AbortSignal) => Promise<void> = async (ms, signal) => { await setTimeout(ms, undefined, { signal }) },
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted()
    try { return await call() }
    catch (error) {
      signal.throwIfAborted()
      if (attempt >= 2 || !isRetryableTranslationError(error)) throw error
      await wait(1000 * 2 ** attempt, signal)
    }
  }
}
