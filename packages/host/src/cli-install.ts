/**
 * Install the headless Agentero CLI into the same managed location the
 * desktop app uses, so either surface can reuse the other's install.
 *
 * Mirrors the desktop Rust installer: download the latest GitHub Release
 * archive for this host triple, verify its SHA-256 sidecar, extract the
 * `agentero` binary, and point a user-bin shim at it. Shell rc files are
 * never edited.
 */
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { chmod, lstat, mkdir, mkdtemp, readFile, readlink, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import * as path from 'node:path'
import { unzipSync } from 'fflate'
import { x as extractTar } from 'tar'
import { runAgentero } from './cli-run.js'

const RELEASE_REPO = 'poco-ai/Agentero'
const RELEASE_PAGE = `https://github.com/${RELEASE_REPO}/releases/latest`
const USER_AGENT = 'agentero-dsh-plugin'
const PROBE_TIMEOUT_MS = 5_000
const LATEST_TTL_MS = 10 * 60_000

let latest: { version: string, at: number } | undefined

export interface CliStatus {
  /** True when a runnable CLI answered `--version`. */
  available: boolean
  /** Version reported by the resolved CLI. */
  version: string | null
  /** Resolved executable when `available`. */
  bin: string | null
  /** Whether the executable came from config or the managed download cache. */
  source: 'configured' | 'managed' | null
  /** The configured executable name or path. */
  configured: string
  /** Managed binary path shared with the desktop app. */
  managedPath: string
  managedInstalled: boolean
  shimPath: string
  shimInstalled: boolean
  /** Whether the shim directory is on this process's PATH. */
  shimOnPath: boolean
  /** Whether this host has a matching Release asset. */
  canInstall: boolean
  /** Rust-style host triple used for the Release asset, when supported. */
  platform: string | null
  releasePageUrl: string
}

export function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/, '')
}

export function versionsEqual(a: string, b: string): boolean {
  return normalizeVersion(a) === normalizeVersion(b)
}

/** Rust target triple for the running host; release assets use the same names. */
export function hostTriple(): string | null {
  const key = `${process.platform}-${process.arch}`
  switch (key) {
    case 'darwin-arm64': return 'aarch64-apple-darwin'
    case 'darwin-x64': return 'x86_64-apple-darwin'
    case 'linux-x64': return 'x86_64-unknown-linux-gnu'
    case 'linux-arm64': return 'aarch64-unknown-linux-gnu'
    case 'win32-x64': return 'x86_64-pc-windows-msvc'
    default: return null
  }
}

export function archiveFileName(version: string, triple: string): string {
  const ext = triple.includes('windows') ? 'zip' : 'tar.gz'
  return `agentero-cli-${normalizeVersion(version)}-${triple}.${ext}`
}

export function releaseDownloadUrl(version: string, triple: string): string {
  const ver = normalizeVersion(version)
  return `https://github.com/${RELEASE_REPO}/releases/download/v${ver}/${archiveFileName(ver, triple)}`
}

export function releaseSha256Url(version: string, triple: string): string {
  return `${releaseDownloadUrl(version, triple)}.sha256`
}

export function parseSha256File(text: string): string {
  const line = text.split(/\r?\n/).map(part => part.trim()).find(part => part !== '')
  if (line === undefined) throw new Error('CLI checksum file is empty')
  const hex = line.split(/\s+/)[0]?.toLowerCase() ?? ''
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error(`invalid CLI checksum: ${hex}`)
  return hex
}

/** Last whitespace-separated token that starts with a digit (`agentero 0.5.3`). */
export function parseCliVersion(text: string): string | null {
  const line = text.split(/\r?\n/).map(part => part.trim()).find(part => part !== '')
  if (line === undefined) return null
  const tokens = line.split(/\s+/)
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index]
    if (token !== undefined && /^[0-9]/.test(token)) return token
  }
  return null
}

function dataLocalDir(): string {
  if (process.platform === 'darwin') return path.join(homedir(), 'Library', 'Application Support')
  if (process.platform === 'win32') return process.env.LOCALAPPDATA ?? path.join(homedir(), 'AppData', 'Local')
  return process.env.XDG_DATA_HOME ?? path.join(homedir(), '.local', 'share')
}

export function managedCliDir(): string {
  return path.join(dataLocalDir(), 'Agentero', 'cli')
}

export function managedCliBinary(): string {
  return path.join(managedCliDir(), process.platform === 'win32' ? 'agentero.exe' : 'agentero')
}

function preferredBinDir(): string {
  if (process.platform !== 'win32') return path.join(homedir(), '.local', 'bin')
  return path.join(process.env.LOCALAPPDATA ?? path.join(homedir(), 'AppData', 'Local'), 'Agentero', 'bin')
}

export function managedShimPath(): string {
  const name = process.platform === 'win32' ? 'agentero-cli.cmd' : 'agentero'
  return path.join(preferredBinDir(), name)
}

function isOnPath(dir: string): boolean {
  const target = path.resolve(dir)
  const entries = (process.env.PATH ?? '').split(path.delimiter)
  return entries.some((entry) => {
    if (entry === '') return false
    const value = path.resolve(entry)
    return process.platform === 'win32' ? value.toLowerCase() === target.toLowerCase() : value === target
  })
}

async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file)
    return true
  } catch {
    return false
  }
}

async function probeVersion(bin: string): Promise<string | null> {
  const result = await runAgentero(bin, ['--version'], PROBE_TIMEOUT_MS, new Set())
  if (result.timedOut || result.spawnError !== undefined || result.code !== 0) return null
  return parseCliVersion(result.stdout) ?? parseCliVersion(result.stderr)
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : String(error)
}

function releaseError(url: string): Error {
  return new Error(`CLI asset not found (404): ${url}. Check the published assets at ${RELEASE_PAGE}`)
}

let curlAvailable: Promise<boolean> | undefined

/** Node's fetch can stall on the GitHub release CDN; curl also honors system proxies. */
function hasCurl(): Promise<boolean> {
  curlAvailable ??= new Promise((resolve) => {
    const child = spawn('curl', ['--version'], { windowsHide: true, stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', code => resolve(code === 0))
  })
  return curlAvailable
}

function runCurl(args: readonly string[], label: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('curl', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => { stdout.push(chunk) })
    child.stderr.on('data', (chunk: Buffer) => { stderr.push(chunk) })
    child.on('error', (error) => { reject(new Error(`${label}: ${error.message}`)) })
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout))
        return
      }
      const message = Buffer.concat(stderr).toString('utf8').trim()
      reject(new Error(`${label}: ${message === '' ? `curl exited with code ${code}` : message}`))
    })
  })
}

async function downloadBuffer(url: string, timeoutMs: number): Promise<Buffer> {
  if (await hasCurl()) {
    const seconds = String(Math.max(1, Math.ceil(timeoutMs / 1000)))
    try {
      return await runCurl(
        ['-fsSL', '--max-time', seconds, '--user-agent', USER_AGENT, url],
        `download failed (${url})`,
      )
    } catch (error) {
      if (errorText(error).includes('404')) throw releaseError(url)
      throw error
    }
  }
  let response: Response
  try {
    response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw new Error(`download failed (${url}): ${errorText(error)}`)
  }
  if (response.status === 404) throw releaseError(url)
  if (!response.ok) throw new Error(`download failed HTTP ${response.status}: ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

/**
 * Resolve the latest tag from the public release redirect instead of the API:
 * unauthenticated GitHub API calls are rate-limited per IP, which made
 * one-click installs fail on shared networks.
 */
async function latestReleaseVersion(): Promise<string> {
  if (latest !== undefined && Date.now() - latest.at < LATEST_TTL_MS) return latest.version
  let location = ''
  try {
    const response = await fetch(RELEASE_PAGE, {
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    })
    location = response.headers.get('location') ?? response.url
  } catch {
    // Fall through to curl; some networks stall Node's HTTP client.
  }
  const tagPattern = /\/releases\/tag\/v?([0-9][^/?#]*)/
  let match = tagPattern.exec(location)
  if (match?.[1] === undefined && await hasCurl()) {
    const devNull = process.platform === 'win32' ? 'NUL' : '/dev/null'
    try {
      const output = await runCurl(
        ['-fsSIL', '--max-time', '20', '--user-agent', USER_AGENT, '-o', devNull, '-w', '%{url_effective}', RELEASE_PAGE],
        'could not read the latest Agentero release',
      )
      match = tagPattern.exec(output.toString('utf8'))
    } catch {
      // Report the shared error below.
    }
  }
  const version = match?.[1] === undefined ? '' : normalizeVersion(match[1])
  if (version === '') {
    throw new Error(`could not read the latest Agentero release. Open ${RELEASE_PAGE} and install the CLI manually`)
  }
  latest = { version, at: Date.now() }
  return version
}

function innerBinaryName(): string {
  return process.platform === 'win32' ? 'agentero.exe' : 'agentero'
}

function extractZip(bytes: Buffer, member: string): Buffer {
  const files = unzipSync(new Uint8Array(bytes))
  const key = Object.keys(files).find(name => path.posix.basename(name) === member)
  const data = key === undefined ? undefined : files[key]
  if (data === undefined) throw new Error(`CLI archive is missing \`${member}\``)
  return Buffer.from(data)
}

async function extractTarGz(bytes: Buffer, member: string): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentero-cli-'))
  const archive = path.join(dir, 'cli.tar.gz')
  try {
    await writeFile(archive, bytes)
    let entryPath: string | undefined
    await extractTar({
      file: archive,
      cwd: dir,
      strict: true,
      filter: (entry) => {
        if (path.basename(entry) !== member) return false
        entryPath ??= entry
        return true
      },
    })
    if (entryPath === undefined) throw new Error(`CLI archive is missing \`${member}\``)
    return await readFile(path.join(dir, entryPath))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function installShim(binary: string): Promise<void> {
  const shim = managedShimPath()
  await mkdir(path.dirname(shim), { recursive: true })
  if (process.platform === 'win32') {
    const existing = await readFile(shim, 'utf8').catch(() => undefined)
    if (existing !== undefined && !/agentero/i.test(existing)) {
      throw new Error(`refusing to overwrite ${shim}: not an Agentero-managed CLI entry`)
    }
    await writeFile(shim, `@echo off\r\n"${binary.replace(/"/g, '')}" %*\r\n`)
    return
  }
  if (await exists(shim)) {
    const info = await lstat(shim)
    if (!info.isSymbolicLink()) {
      throw new Error(`refusing to overwrite ${shim}: not an Agentero-managed CLI entry`)
    }
    const target = await readlink(shim)
    if (!/agentero/i.test(target)) {
      throw new Error(`refusing to overwrite ${shim}: not an Agentero-managed CLI entry`)
    }
    await unlink(shim)
  }
  await symlink(binary, shim)
}

async function probeManaged(managed: string): Promise<string | null> {
  return await probeVersion(managed)
}

export async function cliStatus(settings: { agenteroBin: string }): Promise<CliStatus> {
  const configured = settings.agenteroBin.trim() === '' ? 'agentero' : settings.agenteroBin.trim()
  const managedPath = managedCliBinary()
  const managedVersion = await probeManaged(managedPath)
  const configuredVersion = configured === managedPath ? managedVersion : await probeVersion(configured)
  const shimPath = managedShimPath()
  const source: CliStatus['source'] = configuredVersion !== null
    ? 'configured'
    : managedVersion !== null ? 'managed' : null
  return {
    available: source !== null,
    version: configuredVersion ?? managedVersion,
    bin: configuredVersion !== null ? configured : managedVersion !== null ? managedPath : null,
    source,
    configured,
    managedPath,
    managedInstalled: managedVersion !== null,
    shimPath,
    shimInstalled: await exists(shimPath),
    shimOnPath: isOnPath(path.dirname(shimPath)),
    canInstall: hostTriple() !== null,
    platform: hostTriple(),
    releasePageUrl: RELEASE_PAGE,
  }
}

/**
 * Download and install the latest CLI, then point the config at it when the
 * user still uses the default `agentero` name. Returns the fresh status.
 */
export async function installManagedCli(
  settings: { agenteroBin: string },
  persistBin: (bin: string) => Promise<void>,
): Promise<CliStatus> {
  const triple = hostTriple()
  if (triple === null) {
    throw new Error(`Agentero CLI is not published for ${process.platform}/${process.arch}. Open ${RELEASE_PAGE}`)
  }
  const version = await latestReleaseVersion()
  const managed = managedCliBinary()
  const current = await probeManaged(managed)
  if (current !== null && versionsEqual(current, version)) {
    await installShim(managed)
  } else {
    const [checksum, archive] = await Promise.all([
      downloadBuffer(releaseSha256Url(version, triple), 30_000),
      downloadBuffer(releaseDownloadUrl(version, triple), 180_000),
    ])
    const expected = parseSha256File(checksum.toString('utf8'))
    const actual = createHash('sha256').update(archive).digest('hex')
    if (actual !== expected) {
      throw new Error(`CLI archive checksum mismatch (expected ${expected}, got ${actual})`)
    }
    const member = innerBinaryName()
    const binary = archiveFileName(version, triple).endsWith('.zip')
      ? extractZip(archive, member)
      : await extractTarGz(archive, member)
    await mkdir(managedCliDir(), { recursive: true })
    const partial = `${managed}.${process.pid}.${Date.now()}.partial`
    try {
      await writeFile(partial, binary, { mode: 0o755 })
      if (process.platform !== 'win32') await chmod(partial, 0o755)
      const got = await probeVersion(partial)
      if (got === null) throw new Error('downloaded CLI does not run (`--version` failed)')
      if (!versionsEqual(got, version)) {
        throw new Error(`downloaded CLI version ${got} does not match release ${version}`)
      }
      await rm(managed, { force: true })
      await rename(partial, managed)
      if (process.platform !== 'win32') await chmod(managed, 0o755)
    } catch (error) {
      await rm(partial, { force: true })
      throw error
    }
    await installShim(managed)
  }
  const configured = settings.agenteroBin.trim()
  if (configured === '' || configured === 'agentero') {
    await persistBin(managed).catch(() => {
      // The config writer is best-effort here; cliStatus still falls back to the managed binary.
    })
  }
  return cliStatus(settings)
}
