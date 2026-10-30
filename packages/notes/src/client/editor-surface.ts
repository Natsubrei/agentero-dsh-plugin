import type { CSSProperties } from 'react'
import { cn } from './cn'

/** Scrollport from `editor/editor-surface.tsx` `editorContainerClassName`. */
export const editorContainerClassName = cn(
  'relative h-full w-full cursor-text select-text overflow-y-auto caret-foreground selection:bg-foreground/15 focus-visible:outline-none',
  '[&_.slate-selection-area]:z-50 [&_.slate-selection-area]:border [&_.slate-selection-area]:border-foreground/20 [&_.slate-selection-area]:bg-foreground/10',
)

/** Document column from `editor/editor-surface.tsx` `editorClassName`. */
export const editorClassName = cn(
  'group/editor',
  'relative w-full cursor-text select-text overflow-x-hidden whitespace-break-spaces break-words',
  'rounded-md ring-offset-background focus-visible:outline-none',
  '**:data-slate-placeholder:!top-1/2 **:data-slate-placeholder:-translate-y-1/2 placeholder:text-muted-foreground/80 **:data-slate-placeholder:text-muted-foreground/80 **:data-slate-placeholder:opacity-100!',
  '[&_strong]:font-bold',
)

/**
 * Content inset from `markdown-editor.tsx`. `pl-10` / `pr-14` are the editor
 * gutters (block handle and TOC strip). Those controls are not in this panel.
 */
export const editorContentClassName =
  'min-h-full pl-10 pr-14 pt-4 pb-48 @max-2xs/editor:pr-6 [&>*:first-child]:mt-0'

/** Defaults from Agentero settings: `editorFontSize` 14, line-height 1.6. */
export const editorTextStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
}
