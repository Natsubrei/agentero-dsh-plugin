/**
 * Rewrite a PDF's outline (bookmarks) without touching annotations.
 *
 * Same contract as the desktop app: edit the original outline dictionaries so
 * destinations, actions and styling survive; refuse signed documents because
 * rewriting them would invalidate the signature.
 */
import { createRequire } from 'node:module'
import type { PDFDict as PDFDictType, PDFRef as PDFRefType } from 'pdf-lib'

const require = createRequire(import.meta.url)

/**
 * Load pdf-lib through Node's CommonJS loader instead of the DSH module loader.
 * pdf-lib's barrel modules rely on live CommonJS exports during initialization;
 * loading them through DSH can expose a partial utils module and fail activation.
 */
function loadPdfLib(): typeof import('pdf-lib') {
  return require('pdf-lib') as typeof import('pdf-lib')
}

/** One outline node as the browser sends it. */
export interface BookmarkNode {
  /** Original tree path, or null for a node this session added. */
  origin: string | null
  /** Title read from the PDF, used to detect a stale edit. */
  originalTitle?: string
  title: string
  /** Zero-based page for new or retargeted nodes. */
  pageIndex?: number
  children: BookmarkNode[]
}

const MAX_NODES = 2000
const MAX_DEPTH = 16
const MAX_TITLE = 2000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate an untrusted outline payload.
 * @param value - parsed JSON body field.
 * @returns normalized nodes, or undefined when malformed or too large.
 */
export function bookmarkNodesFrom(value: unknown): BookmarkNode[] | undefined {
  let count = 0
  let bad = false
  const parse = (input: unknown, depth: number): BookmarkNode[] => {
    if (!Array.isArray(input) || depth > MAX_DEPTH) {
      bad = true
      return []
    }
    const nodes: BookmarkNode[] = []
    for (const item of input) {
      if (!isRecord(item)) {
        bad = true
        continue
      }
      const title = typeof item.title === 'string' ? item.title.trim() : ''
      const origin = typeof item.origin === 'string' ? item.origin : null
      const originalTitle = typeof item.originalTitle === 'string' ? item.originalTitle : undefined
      const pageIndex = typeof item.pageIndex === 'number' ? item.pageIndex : undefined
      if (title === '' || title.length > MAX_TITLE) {
        bad = true
        continue
      }
      if (pageIndex !== undefined && (!Number.isInteger(pageIndex) || pageIndex < 0)) {
        bad = true
        continue
      }
      if (origin !== null && origin !== '') {
        const segments = origin.split('.')
        if (!segments.every(segment => /^\d+$/.test(segment))) {
          bad = true
          continue
        }
      }
      count += 1
      if (count > MAX_NODES) {
        bad = true
        return []
      }
      nodes.push({
        origin: origin === '' ? null : origin,
        ...(originalTitle === undefined ? {} : { originalTitle }),
        title,
        ...(pageIndex === undefined ? {} : { pageIndex }),
        children: parse(item.children ?? [], depth + 1),
      })
    }
    return nodes
  }
  const nodes = parse(value, 0)
  return bad ? undefined : nodes
}

/**
 * Bake `nodes` into `bytes` as the document outline.
 * @param bytes - original PDF.
 * @param nodes - desired tree.
 * @returns a new PDF; the input is not mutated.
 */
export async function writePdfBookmarks(
  bytes: Uint8Array,
  nodes: BookmarkNode[],
): Promise<Uint8Array> {
  const {
    PDFDict,
    PDFDocument,
    PDFHexString,
    PDFName,
    PDFNumber,
    PDFRef,
    PDFString,
  } = loadPdfLib()
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
  const name = PDFName.of
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (
      object instanceof PDFDict &&
      (object.has(name('ByteRange')) || object.get(name('FT')) === name('Sig'))
    ) {
      throw new Error('protected')
    }
  }
  const originals = new Map<string, { dict: PDFDictType, ref: PDFRefType }>()
  const seen = new Set<string>()
  const root = pdf.catalog.lookupMaybe(name('Outlines'), PDFDict)
  function read(parent: PDFDictType, prefix: string): void {
    let item = parent.get(name('First'))
    let index = 0
    while (item) {
      if (!(item instanceof PDFRef) || seen.has(item.toString())) throw new Error('unsupported')
      seen.add(item.toString())
      const dict = pdf.context.lookup(item, PDFDict)
      const action = dict.lookupMaybe(name('A'), PDFDict)
      if (action && (action.get(name('S')) !== name('GoTo') || action.has(name('Next')))) {
        throw new Error('unsupported')
      }
      const key = `${prefix}${index++}`
      originals.set(key, { dict, ref: item })
      read(dict, `${key}.`)
      item = dict.get(name('Next'))
    }
  }
  if (root) read(root, '')
  const outlines = root ?? pdf.context.obj({ Type: 'Outlines' })
  const rootRef = pdf.context.getObjectRef(outlines) ?? pdf.context.register(outlines)
  const pages = pdf.getPages()
  const used = new Set<string>()
  function write(items: BookmarkNode[], parent: PDFDictType, parentRef: PDFRefType): number {
    const entries = items.map((node) => {
      if (!node.title.trim()) throw new Error('invalid')
      if (
        node.origin !== null &&
        (used.has(node.origin) || !originals.has(node.origin))
      ) {
        throw new Error('unsupported')
      }
      if (node.origin !== null) used.add(node.origin)
      const original = node.origin === null ? undefined : originals.get(node.origin)
      if (original && node.originalTitle !== undefined) {
        const title = original.dict.lookup(name('Title'))
        if (
          !(title instanceof PDFString || title instanceof PDFHexString) ||
          title.decodeText() !== node.originalTitle
        ) {
          throw new Error('unsupported')
        }
      }
      const dict = original?.dict ?? pdf.context.obj({})
      const ref = original?.ref ?? pdf.context.register(dict)
      dict.set(name('Title'), PDFHexString.fromText(node.title.trim()))
      dict.set(name('Parent'), parentRef)
      if (node.pageIndex !== undefined) {
        if (!Number.isInteger(node.pageIndex) || !pages[node.pageIndex]) throw new Error('invalid')
        dict.delete(name('A'))
        dict.set(name('Dest'), pdf.context.obj([pages[node.pageIndex].ref, 'Fit']))
      } else if (!original) {
        throw new Error('invalid')
      }
      return { node, dict, ref }
    })
    parent.delete(name('First'))
    parent.delete(name('Last'))
    if (entries.length) {
      parent.set(name('First'), entries[0].ref)
      parent.set(name('Last'), entries[entries.length - 1].ref)
    }
    let visible = 0
    entries.forEach(({ node, dict, ref }, i) => {
      dict.delete(name('Prev'))
      dict.delete(name('Next'))
      if (i > 0) dict.set(name('Prev'), entries[i - 1].ref)
      if (i + 1 < entries.length) dict.set(name('Next'), entries[i + 1].ref)
      const closed = (dict.lookupMaybe(name('Count'), PDFNumber)?.asNumber() ?? 0) < 0
      const children = write(node.children, dict, ref)
      dict.delete(name('Count'))
      if (children) dict.set(name('Count'), PDFNumber.of(closed ? -children : children))
      visible += 1 + (closed ? 0 : children)
    })
    return visible
  }
  const count = write(nodes, outlines, rootRef)
  outlines.set(name('Count'), PDFNumber.of(count))
  if (nodes.length) pdf.catalog.set(name('Outlines'), rootRef)
  else pdf.catalog.delete(name('Outlines'))
  const saved = await pdf.save({ updateFieldAppearances: false })
  const check = await PDFDocument.load(saved, { updateMetadata: false })
  if (check.getPageCount() !== pages.length) throw new Error('invalid')
  return saved
}
