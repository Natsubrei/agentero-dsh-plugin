import { ChevronRightIcon, FileIcon } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { cn } from './cn'

interface FileTreeContextType {
  selectedPath?: string
  onSelect?: (path: string) => void
}

const FileTreeContext = createContext<FileTreeContextType>({})

export type FileTreeProps = Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  selectedPath?: string
  onSelect?: (path: string) => void
}

/** Flat tree shell. Row chrome matches `ai-elements/file-tree`. */
export function FileTree({
  selectedPath,
  onSelect,
  className,
  children,
  ...props
}: FileTreeProps) {
  const value = useMemo(() => ({ selectedPath, onSelect }), [selectedPath, onSelect])
  return (
    <FileTreeContext.Provider value={value}>
      <div className={cn('text-sm', className)} role="tree" {...props}>
        {children}
      </div>
    </FileTreeContext.Provider>
  )
}

export type FileTreeIconProps = HTMLAttributes<HTMLSpanElement>

export function FileTreeIcon({ className, children, ...props }: FileTreeIconProps) {
  return (
    <span className={cn('shrink-0', className)} {...props}>
      {children}
    </span>
  )
}

export type FileTreeNameProps = HTMLAttributes<HTMLSpanElement>

export function FileTreeName({ className, children, ...props }: FileTreeNameProps) {
  return (
    <span className={cn('truncate', className)} {...props}>
      {children}
    </span>
  )
}

/**
 * Disclosure affordance copied from the file-tree row. Notes are a flat list,
 * so rows do not expand; the classes stay with the row pieces.
 */
export function FileTreeDisclosureIcon({
  isExpanded,
  icon,
}: {
  isExpanded: boolean
  icon: ReactNode
}) {
  return (
    <span className="relative flex size-4 shrink-0 items-center justify-center">
      <span className="transition-opacity duration-100 group-hover:opacity-0 group-focus-visible:opacity-0">
        {icon}
      </span>
      <ChevronRightIcon
        className={cn(
          'pointer-events-none absolute size-4 text-muted-foreground opacity-0 transition-[opacity,transform] duration-100 group-hover:opacity-100 group-focus-visible:opacity-100',
          isExpanded && 'rotate-90',
        )}
        aria-hidden
      />
    </span>
  )
}

/** Row interaction states shared by the reading tree and the writing sidebar. */
export const FILE_TREE_ROW_STATE =
  'transition-colors duration-75 hover:bg-sidebar-accent/80 active:not-has-[[data-tex-compile]:active]:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/80'
export const FILE_TREE_ROW_SELECTED_STATE =
  'bg-sidebar-primary/75 text-sidebar-primary-foreground hover:bg-sidebar-primary/85 active:not-has-[[data-tex-compile]:active]:bg-sidebar-primary/90 [&_svg]:text-sidebar-primary-foreground/90'

export type FileTreeFileProps = HTMLAttributes<HTMLDivElement> & {
  path: string
  name: string
  icon?: ReactNode
}

export function FileTreeFile({
  path,
  name,
  icon,
  className,
  children,
  ...props
}: FileTreeFileProps) {
  const { selectedPath, onSelect } = useContext(FileTreeContext)
  const isSelected = selectedPath === path

  const select = useCallback(() => {
    onSelect?.(path)
  }, [onSelect, path])

  const handleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.currentTarget.focus()
    select()
  }, [select])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    select()
  }, [select])

  return (
    <div
      data-path={path}
      className={cn(
        'group flex h-7 min-h-7 cursor-pointer items-center gap-1 rounded px-4',
        FILE_TREE_ROW_STATE,
        isSelected && FILE_TREE_ROW_SELECTED_STATE,
        className,
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="treeitem"
      aria-selected={isSelected}
      tabIndex={0}
      {...props}
    >
      {children ?? (
        <>
          <FileTreeIcon>
            {icon ?? <FileIcon className="size-4 text-muted-foreground" />}
          </FileTreeIcon>
          <FileTreeName>{name}</FileTreeName>
        </>
      )}
    </div>
  )
}
