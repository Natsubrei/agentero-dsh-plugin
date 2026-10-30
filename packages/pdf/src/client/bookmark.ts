/**
 * PDF outline (bookmark) helpers for the sidebar panel.
 *
 * The panel edits a local tree and hands it back to the parent through
 * `onSave`, so these helpers only deal with the in-memory shape: converting
 * the reader's `PdfBookmarkObject[]`, resolving a destination page, and
 * updating / removing a node. Writing the outline back into the PDF belongs to
 * the parent.
 */

import { PdfActionType, type PdfBookmarkObject } from '@embedpdf/models'

/** One outline node while it is being edited in the sidebar. */
export type EditableBookmark = {
  id: string
  /** Original tree path; null for a new bookmark. */
  origin: string | null
  originalTitle?: string
  title: string
  /** Only set for a new / explicitly retargeted bookmark (zero-based). */
  pageIndex?: number
  target?: PdfBookmarkObject['target']
  children: EditableBookmark[]
}

/**
 * Resolve the zero-based page index a PDF bookmark points to.
 * Supports direct destinations and GoTo action destinations.
 * Returns null for bookmarks with no target or unsupported action types.
 */
export function bookmarkPageIndex(
  node: Pick<PdfBookmarkObject, 'target'>,
): number | null {
  const target = node.target
  if (target?.type === 'destination') {
    return target.destination.pageIndex
  }
  if (target?.type === 'action' && target.action.type === PdfActionType.Goto) {
    return target.action.destination.pageIndex
  }
  return null
}

/** Convert the reader's bookmark tree into editable nodes. */
export function editableBookmarks(
  nodes: PdfBookmarkObject[],
  prefix = '',
): EditableBookmark[] {
  return nodes.map((node, index) => {
    const origin = `${prefix}${index}`
    return {
      id: origin,
      origin,
      originalTitle: node.title,
      title: node.title,
      target: node.target,
      children: editableBookmarks(node.children ?? [], `${origin}.`),
    }
  })
}

/** Replace one node (or drop it when `update` returns null). */
export function updateBookmark(
  nodes: EditableBookmark[],
  id: string,
  update: (node: EditableBookmark) => EditableBookmark | null,
): EditableBookmark[] {
  return nodes.flatMap((node) => {
    if (node.id === id) {
      const next = update(node)
      return next ? [next] : []
    }
    return [{ ...node, children: updateBookmark(node.children, id, update) }]
  })
}

/** Remove one node but promote its children to its position. */
export function removeBookmark(
  nodes: EditableBookmark[],
  id: string,
): EditableBookmark[] {
  return nodes.flatMap((node) =>
    node.id === id
      ? node.children
      : [{ ...node, children: removeBookmark(node.children, id) }],
  )
}
