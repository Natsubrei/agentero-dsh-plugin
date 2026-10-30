import { ignore, type PdfEngine } from '@embedpdf/models'
import { createPdfiumEngine as createDirectEngine } from '@embedpdf/engines/pdfium-direct-engine'
import { createPdfiumEngine as createWorkerEngine } from '@embedpdf/engines/pdfium-worker-engine'

/** The worker factory patch exposes its initialization handshake. */
type WorkerPdfEngine = PdfEngine & {
  whenReady(): { toPromise(): Promise<unknown> }
}

const WORKER_READY_TIMEOUT_MS = 8000
const PDFIUM_WASM_PATH = '/agentero/api/pdfium.wasm'

let workerEngineUsable = true
let enginePromise: Promise<PdfEngine> | undefined

/** A failed startup must not queue closeDocument behind an unresolved handshake. */
function destroyPdfEngine(engine: PdfEngine): void {
  engine.destroy?.().wait(ignore, ignore)
}

function wasmUrl(): string {
  return new URL(PDFIUM_WASM_PATH, window.location.origin).href
}

async function waitWorkerReady(engine: WorkerPdfEngine): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      engine.whenReady().toPromise(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('PDF worker initialization timed out')),
          WORKER_READY_TIMEOUT_MS,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Same startup order as Agentero: worker engine, then the direct engine.
 * Font fallback stays off. The desktop app loads CJK fonts through Tauri;
 * this page fetches `pdfium.wasm` from the host instead.
 */
async function createPdfEngine(): Promise<PdfEngine> {
  if (workerEngineUsable) {
    let worker: PdfEngine | undefined
    try {
      worker = createWorkerEngine(wasmUrl(), { fontFallback: null })
      await waitWorkerReady(worker as WorkerPdfEngine)
      return worker
    } catch (error) {
      if (worker) destroyPdfEngine(worker)
      workerEngineUsable = false
      console.warn('PDF worker unavailable, using direct engine', error)
    }
  }
  return createDirectEngine(wasmUrl(), { fontFallback: null })
}

/** One engine for the page. A failed start can be retried. */
export function loadPdfEngine(): Promise<PdfEngine> {
  if (enginePromise === undefined) {
    enginePromise = createPdfEngine().catch((error: unknown) => {
      enginePromise = undefined
      throw error
    })
  }
  return enginePromise
}
