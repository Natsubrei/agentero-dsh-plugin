import type { ReactNode } from 'react'
import { cn } from './cn'
import {
  editorClassName,
  editorContainerClassName,
  editorContentClassName,
  editorTextStyle,
} from './editor-surface'

const QUERY = '@container/editor relative flex h-full min-h-0 min-w-0 flex-1 flex-col'

export function NoteReadView({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className={QUERY}>
      <div
        className={cn(editorContainerClassName, 'min-h-0 min-w-0 flex-1')}
        style={editorTextStyle}
      >
        <div className={cn(editorClassName, editorContentClassName)}>
          {children}
        </div>
      </div>
    </div>
  )
}

export function NoteEditor({
  value,
  label,
  onChange,
}: {
  value: string
  label: string
  onChange: (value: string) => void
}): ReactNode {
  return (
    <div className={QUERY}>
      <textarea
        className={cn(
          editorContainerClassName,
          editorClassName,
          editorContentClassName,
          'min-h-0 flex-1 resize-none appearance-none border-0 bg-transparent font-sans text-foreground shadow-none',
        )}
        style={editorTextStyle}
        value={value}
        aria-label={label}
        onChange={(event) => { onChange(event.target.value) }}
      />
    </div>
  )
}
