/**
 * Normalized page regions (0–1 of the page element) for visual crop.
 *
 * Kept independent of EmbedPDF so the toolbar, the selection layer, and the
 * crop renderer all share the same definition of a region.
 */

/** A rectangle in page-relative coordinates: 0–1 from the top-left corner. */
export type PdfRegion = { x: number; y: number; w: number; h: number }

/** Drags shorter than this on either axis are treated as accidental clicks. */
const MIN_REGION_SIZE = 0.004

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/**
 * Build a normalized region from two drag points, whichever direction the
 * user dragged. Returns null for empty or too-small selections.
 */
export function normalizedRegionFromPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
): PdfRegion | null {
  const left = clamp01(Math.min(a.x, b.x))
  const top = clamp01(Math.min(a.y, b.y))
  const right = clamp01(Math.max(a.x, b.x))
  const bottom = clamp01(Math.max(a.y, b.y))
  const width = right - left
  const height = bottom - top
  if (width < MIN_REGION_SIZE || height < MIN_REGION_SIZE) return null
  return { x: left, y: top, w: width, h: height }
}

/** Map a normalized region onto the PDF page's native coordinate space. */
export function normalizedRegionToPdfRect(
  region: PdfRegion,
  size: { width: number; height: number },
): { x: number; y: number; w: number; h: number } | null {
  if (size.width <= 0 || size.height <= 0) return null
  const left = clamp01(region.x)
  const top = clamp01(region.y)
  const right = clamp01(region.x + region.w)
  const bottom = clamp01(region.y + region.h)
  const width = (right - left) * size.width
  const height = (bottom - top) * size.height
  if (width <= 0 || height <= 0) return null
  return { x: left * size.width, y: top * size.height, w: width, h: height }
}
