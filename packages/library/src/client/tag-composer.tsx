import { useState, type ReactNode } from 'react'
import { Input } from './input'

type TagComposerProps = {
  /** Placeholder and accessible name, e.g. "标签". */
  label: string
  disabled: boolean
  /** Resolves true when the tag was saved, so the draft can be cleared. */
  onAdd: (tag: string) => Promise<boolean>
}

/**
 * Per-row tag input. The draft lives here rather than in the panel so typing
 * re-renders one cell instead of every row in the table.
 */
export function TagComposer({ label, disabled, onAdd }: TagComposerProps): ReactNode {
  const [value, setValue] = useState('')
  const [pending, setPending] = useState(false)

  return (
    <Input
      value={value}
      placeholder={label}
      aria-label={label}
      disabled={disabled || pending}
      className='h-6 w-16 border-transparent bg-muted/70 px-1.5 text-xs shadow-none placeholder:text-muted-foreground/70 focus-visible:border-border/60 focus-visible:bg-card'
      onMouseDown={(event) => { event.stopPropagation() }}
      onClick={(event) => { event.stopPropagation() }}
      onChange={(event) => { setValue(event.target.value) }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key !== 'Enter') return
        event.preventDefault()
        const tag = value.trim()
        if (tag === '' || pending) return
        setPending(true)
        void onAdd(tag)
          .then((saved) => { if (saved) setValue('') })
          .finally(() => { setPending(false) })
      }}
    />
  )
}
