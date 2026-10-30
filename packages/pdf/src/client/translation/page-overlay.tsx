import { memo, type ReactNode } from 'react'
import { fontFamily } from './fonts'
import type { TranslatedPage } from './use-page-translation'
import type { PdfPaperTone } from '../page-theme'

/** Same page boxes and reflow units as motif; source PDF pixels stay underneath. */
export const PageTranslationOverlay = memo(function PageTranslationOverlay({ state, width, height, tone }: {
  state: TranslatedPage | undefined
  width: number
  height: number
  tone: PdfPaperTone
}): ReactNode {
  if (!state) return null
  const sx = width / state.source.width, sy = height / state.source.height
  const dark = tone === 'dark'
  return <div className="pointer-events-none absolute inset-0 z-[2]" data-page-translation>
    {state.layouts.filter(p => p.fits).map(layout => <div key={layout.id} data-translation-region={layout.id}
      className="pointer-events-auto absolute select-text"
      onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}
      style={{ left: layout.sourceBox.x * sx, top: layout.sourceBox.y * sy, width: layout.sourceBox.w * sx, height: layout.sourceBox.h * sy,
        background: dark ? '#000' : '#fff', color: dark ? '#fff' : '#000' }}>
      {layout.units.map((unit, index) => {
        const style = { position: 'absolute' as const, left: (unit.x - layout.sourceBox.x) * sx,
          top: (unit.y - layout.sourceBox.y - (unit.formula ? unit.height : unit.fontSize * 0.8)) * sy,
          width: unit.width * sx, height: unit.height * sy, fontSize: unit.fontSize * sy,
          lineHeight: 1, fontFamily, fontWeight: unit.font.toLowerCase().includes('bold') ? 700 : 400,
          fontStyle: unit.font.toLowerCase().includes('italic') ? 'italic' : 'normal', whiteSpace: 'pre' as const,
          color: dark ? '#fff' : `rgb(${unit.color.r}, ${unit.color.g}, ${unit.color.b})` }
        if (unit.formula) return <img key={index} alt={unit.text} draggable={false}
          src={state.formulas.get(`${layout.id}:${unit.formula.id}`)}
          style={{ ...style, filter: dark ? 'invert(1) hue-rotate(180deg)' : undefined }} />
        return <span key={index} style={style}>{unit.text}</span>
      })}
    </div>)}
  </div>
})
