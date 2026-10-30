import { spawn, type ChildProcess } from 'node:child_process'

export interface CliRunResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  spawnError?: string
}

/**
 * Run `agentero` with an argument array. `shell` stays off.
 * The child is tracked so unload can kill it.
 */
export function runAgentero(
  bin: string,
  args: readonly string[],
  timeoutMs: number,
  children: Set<ChildProcess>,
  stdin?: string,
): Promise<CliRunResult> {
  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      child = spawn(bin, args, {
        shell: false,
        windowsHide: true,
        stdio: [stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({
        code: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        spawnError: error instanceof Error ? error.message : String(error),
      })
      return
    }
    children.add(child)
    if (stdin !== undefined) child.stdin?.end(stdin)
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let settled = false
    let timedOut = false
    let spawnError: string | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      resolve({
        code: child.exitCode,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        timedOut,
        ...(spawnError !== undefined ? { spawnError } : {}),
      })
    }
    timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill()
      } catch {
        // The child already exited.
      }
      finish()
    }, timeoutMs)
    child.stdout?.on('data', (chunk: Buffer) => { stdout.push(chunk) })
    child.stderr?.on('data', (chunk: Buffer) => { stderr.push(chunk) })
    child.on('error', (error: Error) => {
      spawnError = error.message
      finish()
    })
    child.on('close', () => {
      children.delete(child)
      finish()
    })
  })
}

/** Human-readable failure. JSON mode prints `{ ok:false, error:{ message } }` on stdout. */
export function cliFailure(result: CliRunResult, label: string): string {
  if (result.timedOut) return `${label} timed out`
  if (result.spawnError !== undefined && result.spawnError !== '') return result.spawnError
  const stderr = result.stderr.trim()
  if (stderr !== '') return stderr
  const stdout = result.stdout.trim()
  if (stdout !== '') {
    try {
      const parsed: unknown = JSON.parse(stdout)
      if (parsed !== null && typeof parsed === 'object' && 'error' in parsed) {
        const error = parsed.error
        if (typeof error === 'string' && error !== '') return error
        if (error !== null && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
          return error.message
        }
      }
    } catch {
      // Fall through to the raw stdout.
    }
    return stdout.slice(0, 500)
  }
  if (result.code === null) return `${label} failed`
  return `agentero exited with code ${result.code}`
}
