/**
 * Per-page overlay for PDF link annotations (citations, figure/section refs,
 * external URLs). The annotation plugin already parsed each link's rect and
 * target; this layer turns them into transparent hit targets that navigate.
 */
import {
  PdfActionType,
  PdfAnnotationSubtype,
  PdfZoomMode,
} from '@embedpdf/models'
import type {
  PdfAnnotationObject,
  PdfDestinationObject,
  PdfLinkAnnoObject,
  PdfLinkTarget,
} from '@embedpdf/models'
import { useAnnotation } from '@embedpdf/plugin-annotation/react'
import { useScroll } from '@embedpdf/plugin-scroll/react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { useMemo, type ReactNode } from 'react'
import { linkTargetUrl } from './link-target'

type PdfT = PropsLocale<'agentero.pdf'>['t']

export function isLinkObject(
  object: PdfAnnotationObject,
): object is PdfLinkAnnoObject {
  return object.type === PdfAnnotationSubtype.LINK
}

/**
 * External URL for a link annotation. Launch actions are deliberately ignored:
 * opening arbitrary local file paths from a PDF is not safe in the browser.
 */
function externalUrl(link: PdfLinkAnnoObject): string | null {
  const target = link.target
  if (target?.type !== 'action' || target.action.type !== PdfActionType.URI) {
    return null
  }
  return linkTargetUrl(target)
}

/**
 * Extract the destination page + anchor position from a link target, if any.
 * Coordinates are PDF-native (origin bottom-left). `pdfX` is null when the
 * destination only pins a row (FitH) or the viewer does not expose x.
 */
export function getLinkDestination(
  target: PdfLinkTarget | undefined,
): { pageIndex: number; pdfX: number | null; pdfY: number } | null {
  if (!target) return null
  let destination: PdfDestinationObject | null = null
  if (target.type === 'destination') {
    destination = target.destination
  } else if (
    target.type === 'action' &&
    target.action.type === PdfActionType.Goto
  ) {
    destination = target.action.destination
  }
  if (!destination) return null
  if (destination.zoom.mode === PdfZoomMode.XYZ) {
    // PDF-native coordinate: origin bottom-left, y grows upward.
    return {
      pageIndex: destination.pageIndex,
      pdfX: destination.zoom.params.x ?? null,
      pdfY: destination.zoom.params.y,
    }
  }
  // For non-XYZ destinations the viewer still exposes the raw /View array.
  // /FitR: [left bottom right top]; /FitH: [top]. Use the vertical anchor so
  // the coordinate key matches the value parsed by pdf-lib.
  const view = destination.view
  if (destination.zoom.mode === PdfZoomMode.FitRectangle && view.length >= 4) {
    return { pageIndex: destination.pageIndex, pdfX: view[0], pdfY: view[3] }
  }
  if (destination.zoom.mode === PdfZoomMode.FitHorizontal && view.length >= 1) {
    return { pageIndex: destination.pageIndex, pdfX: null, pdfY: view[0] }
  }
  return { pageIndex: destination.pageIndex, pdfX: null, pdfY: 0 }
}

/**
 * Transparent hit targets over each link rect. Positioned in page-percentage
 * units so they track zoom for free.
 */
export function PdfLinkLayer({
  docId,
  pageIndex,
  pageWidth,
  pageHeight,
  t,
}: {
  docId: string
  pageIndex: number
  pageWidth: number
  pageHeight: number
  t: PdfT
}): ReactNode {
  const { state } = useAnnotation(docId)
  const scroll = useScroll(docId)

  const links = useMemo(() => {
    return Object.values(state.byUid).flatMap(({ object }) => {
      if (!isLinkObject(object)) return []
      if (object.pageIndex !== pageIndex) return []
      if (object.target === undefined) return []
      return [object]
    })
  }, [state.byUid, pageIndex])

  if (links.length === 0 || pageWidth <= 0 || pageHeight <= 0) return null

  return (
    <>
      {links.map((link) => {
        const { rect } = link
        return (
          <button
            key={`${link.id}-${pageIndex}-${rect.origin.x}-${rect.origin.y}-${rect.size.width}-${rect.size.height}`}
            type="button"
            tabIndex={-1}
            aria-label={t('linkAria')}
            className="absolute z-[2] cursor-pointer rounded-[2px] border-0 bg-transparent p-0 hover:bg-primary/10"
            style={{
              left: `${(rect.origin.x / pageWidth) * 100}%`,
              top: `${(rect.origin.y / pageHeight) * 100}%`,
              width: `${(rect.size.width / pageWidth) * 100}%`,
              height: `${(rect.size.height / pageHeight) * 100}%`,
            }}
            onClick={(event) => {
              event.stopPropagation()
              const url = externalUrl(link)
              if (url !== null) {
                window.open(url, '_blank', 'noopener,noreferrer')
                return
              }
              const destination = getLinkDestination(link.target)
              if (destination === null) return
              scroll.provides?.scrollToPage({
                pageNumber: destination.pageIndex + 1,
                behavior: 'instant',
              })
            }}
          />
        )
      })}
    </>
  )
}
