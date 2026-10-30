import type { PdfDocumentObject, PdfEngine } from '@embedpdf/models'
import { normalizedRegionToPdfRect, type PdfRegion } from './region'

const MAX_CROP_EDGE_PX = 1600
const BASE64_CHUNK_SIZE = 0x8000

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < buffer.length; offset += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...buffer.subarray(offset, offset + BASE64_CHUNK_SIZE))
  }
  return btoa(binary)
}

/**
 * Render a normalized page region to a PNG and return it as bare base64
 * (no `data:` prefix), ready to hand to the host for persistence.
 */
export async function cropPdfRegion({
  engine,
  document,
  pageIndex,
  region,
  maxEdgePx = MAX_CROP_EDGE_PX,
}: {
  engine: PdfEngine
  document: PdfDocumentObject
  pageIndex: number
  region: PdfRegion
  maxEdgePx?: number
}): Promise<{ mediaType: 'image/png'; data: string }> {
  const page = document.pages[pageIndex]
  if (!page) throw new Error('PDF page is unavailable')
  const rect = normalizedRegionToPdfRect(region, page.size)
  if (!rect) throw new Error('PDF crop region is empty')
  const edge = Number.isFinite(maxEdgePx) && maxEdgePx > 0 ? maxEdgePx : MAX_CROP_EDGE_PX
  const scaleFactor = Math.max(
    0.25,
    Math.min(
      2,
      edge /
        Math.max(page.size.width * region.w, page.size.height * region.h, 1),
    ),
  )
  const blob = await engine
    .renderPageRect(
      document,
      page,
      { origin: { x: rect.x, y: rect.y }, size: { width: rect.w, height: rect.h } },
      {
        scaleFactor,
        imageType: 'image/png',
        withAnnotations: false,
        withForms: false,
      },
    )
    .toPromise()
  return { mediaType: 'image/png', data: await blobToBase64(blob) }
}
