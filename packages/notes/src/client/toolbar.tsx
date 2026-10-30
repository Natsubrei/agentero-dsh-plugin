import { Pencil, Save, X } from 'lucide-react'
import { Toolbar as ToolbarPrimitive } from 'radix-ui'
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import { cn } from './cn'
import { Separator } from './separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

/** `editor/toolbar/primitives.tsx` */
const toolbarButtonClassName =
  "inline-flex h-8 min-w-8 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md bg-transparent px-1.5 font-medium text-sm outline-none transition-[color,box-shadow] hover:bg-muted hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-checked:bg-accent aria-checked:text-accent-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0"

/** `editor/toolbar/responsive-toolbar.tsx` fixed bar. */
const fixedBarClassName =
  'h-9 w-full shrink-0 items-center justify-between rounded-none border-b border-b-border bg-background/95 p-1 backdrop-blur-sm supports-backdrop-blur:bg-background/60'

function Toolbar({
  className,
  ...props
}: ComponentProps<typeof ToolbarPrimitive.Root>) {
  return (
    <ToolbarPrimitive.Root
      className={cn('relative flex select-none items-center', className)}
      {...props}
    />
  )
}

function ToolbarButton({
  children,
  className,
  tooltip,
  ...props
}: ComponentProps<typeof ToolbarPrimitive.Button> & { tooltip?: string }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const button = (
    <ToolbarPrimitive.Button className={cn(toolbarButtonClassName, className)} {...props}>
      {children}
    </ToolbarPrimitive.Button>
  )

  if (tooltip === undefined || !mounted) return button

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent sideOffset={4}>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

interface NoteAction {
  id: string
  label: string
  icon: ReactNode
  group: number
  onClick: () => void
}

export function NoteToolbar({
  editing,
  busy,
  editLabel,
  saveLabel,
  cancelLabel,
  onEdit,
  onSave,
  onCancel,
}: {
  editing: boolean
  busy: boolean
  editLabel: string
  saveLabel: string
  cancelLabel: string
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
}): ReactNode {
  const actions: NoteAction[] = editing
    ? [
        { id: 'save', label: saveLabel, icon: <Save />, group: 0, onClick: onSave },
        { id: 'cancel', label: cancelLabel, icon: <X />, group: 1, onClick: onCancel },
      ]
    : [
        { id: 'edit', label: editLabel, icon: <Pencil />, group: 0, onClick: onEdit },
      ]

  return (
    <TooltipProvider>
      <Toolbar className={cn(fixedBarClassName, 'overflow-hidden')}>
        {actions.map((action, index) => {
          const previous = actions[index - 1]
          const showSeparator = previous !== undefined && action.group !== previous.group
          return (
            <div key={action.id} className="flex shrink-0 items-center">
              {showSeparator ? <Separator orientation="vertical" className="mx-1.5 h-5 w-px" /> : null}
              <ToolbarButton
                tooltip={action.label}
                aria-label={action.label}
                disabled={busy}
                onClick={action.onClick}
                className="gap-1 px-2"
              >
                {action.icon}
                <span className="font-medium text-xs">{action.label}</span>
              </ToolbarButton>
            </div>
          )
        })}
      </Toolbar>
    </TooltipProvider>
  )
}
