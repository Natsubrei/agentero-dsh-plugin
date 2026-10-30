import { Toolbar as ToolbarPrimitive } from 'radix-ui'
import { useEffect, useState, type ComponentProps } from 'react'
import { cn } from './cn'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

/** `editor/toolbar/primitives.tsx` */
const toolbarButtonClassName =
  "inline-flex h-7 min-w-7 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-md border-0 bg-transparent px-1.5 font-medium text-sm text-muted-foreground shadow-none outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-checked:bg-accent aria-checked:text-accent-foreground [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:pointer-events-none [&_svg]:shrink-0"

export function Toolbar({
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

export function ToolbarButton({
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

