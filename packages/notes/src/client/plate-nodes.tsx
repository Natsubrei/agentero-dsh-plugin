import { isOrderedList } from '@platejs/list'
import { useTodoListElement, useTodoListElementState } from '@platejs/list/react'
import katex from 'katex'
import type { TEquationElement, TLinkElement, TListElement } from 'platejs'
import {
  PlateElement,
  PlateLeaf,
  useEditorRef,
  useReadOnly,
  useSelected,
  type PlateElementProps,
  type PlateLeafProps,
  type RenderNodeWrapper,
} from 'platejs/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  blockquoteClassName,
  codeBlockCodeClassName,
  codeBlockPreClassName,
  codeLeafClassName,
  headingVariants,
  hrClassName,
  linkClassName,
  paragraphClassName,
} from './node-classes'

function heading(level: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') {
  return function HeadingElement(props: PlateElementProps): ReactNode {
    return (
      <PlateElement {...props} as={level} className={headingVariants({ variant: level })}>
        {props.children}
      </PlateElement>
    )
  }
}

export const H1Element = heading('h1')
export const H2Element = heading('h2')
export const H3Element = heading('h3')
export const H4Element = heading('h4')
export const H5Element = heading('h5')
export const H6Element = heading('h6')

export function ParagraphElement(props: PlateElementProps): ReactNode {
  return (
    <PlateElement {...props} className={paragraphClassName}>
      {props.children}
    </PlateElement>
  )
}

export function BlockquoteElement(props: PlateElementProps): ReactNode {
  return (
    <PlateElement {...props} as="blockquote" className={blockquoteClassName}>
      {props.children}
    </PlateElement>
  )
}

export function HrElement(props: PlateElementProps): ReactNode {
  return (
    <PlateElement {...props}>
      <div contentEditable={false} className={hrClassName} />
      {props.children}
    </PlateElement>
  )
}

export function LinkElement(props: PlateElementProps<TLinkElement>): ReactNode {
  return (
    <PlateElement
      {...props}
      as="a"
      className={linkClassName}
      attributes={{ ...props.attributes, href: props.element.url }}
    >
      {props.children}
    </PlateElement>
  )
}

export function CodeLeaf(props: PlateLeafProps): ReactNode {
  return <PlateLeaf {...props} className={codeLeafClassName} />
}

export function SearchLeaf(props: PlateLeafProps): ReactNode {
  return <PlateLeaf {...props} className="rounded-sm bg-amber-300/70" />
}

export function CodeBlockElement(props: PlateElementProps): ReactNode {
  return (
    <PlateElement {...props} as="pre" className={codeBlockPreClassName}>
      <code className={codeBlockCodeClassName}>{props.children}</code>
    </PlateElement>
  )
}

export function CodeLineElement(props: PlateElementProps): ReactNode {
  return <PlateElement {...props} as="div">{props.children}</PlateElement>
}

export function CodeSyntaxLeaf(props: PlateLeafProps): ReactNode {
  return <PlateLeaf {...props} />
}

export function TableElement(props: PlateElementProps): ReactNode {
  return (
    <PlateElement {...props} as="table" className="my-2 w-full table-fixed border-collapse border border-border text-sm">
      <tbody>{props.children}</tbody>
    </PlateElement>
  )
}

export function TableRowElement(props: PlateElementProps): ReactNode {
  return <PlateElement {...props} as="tr" className="border-b border-border" />
}

export function TableCellElement(props: PlateElementProps): ReactNode {
  return (
    <PlateElement {...props} as="td" className="border border-border px-2 py-1 align-top">
      {props.children}
    </PlateElement>
  )
}

export function TableCellHeaderElement(props: PlateElementProps): ReactNode {
  return (
    <PlateElement {...props} as="th" className="border border-border bg-muted/50 px-2 py-1 text-left align-top font-semibold">
      {props.children}
    </PlateElement>
  )
}

function mathHtml(tex: string, displayMode: boolean): string {
  const source = tex.trim() === '' ? '\\,' : tex
  return katex.renderToString(source, {
    displayMode,
    output: 'mathml',
    throwOnError: false,
    trust: false,
  })
}

function EquationBody({
  element,
  tex,
  displayMode,
}: {
  element: TEquationElement
  tex: string
  displayMode: boolean
}): ReactNode {
  const editor = useEditorRef()
  const readOnly = useReadOnly()
  const selected = useSelected()
  const [open, setOpen] = useState(false)
  const html = useMemo(() => mathHtml(tex, displayMode), [tex, displayMode])
  useEffect(() => {
    if (selected && !readOnly) setOpen(true)
  }, [readOnly, selected])
  return (
    <div contentEditable={false}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {open && !readOnly ? (
        <textarea
          aria-label="TeX"
          className="mt-1 w-full rounded-md border border-border bg-transparent px-2 py-1 font-mono text-sm"
          value={tex}
          onBlur={() => { setOpen(false) }}
          onChange={(event) => {
            const path = editor.api.findPath(element)
            if (path === undefined) return
            editor.tf.setNodes({ texExpression: event.target.value }, { at: path })
          }}
        />
      ) : null}
    </div>
  )
}

export function EquationElement(props: PlateElementProps<TEquationElement>): ReactNode {
  const tex = props.element.texExpression ?? ''
  return (
    <PlateElement {...props} className="my-2">
      <EquationBody element={props.element} tex={tex} displayMode />
      {props.children}
    </PlateElement>
  )
}

export function InlineEquationElement(props: PlateElementProps<TEquationElement>): ReactNode {
  const tex = props.element.texExpression ?? ''
  const selected = useSelected()
  return (
    <PlateElement {...props} as="span" className={selected ? 'rounded-sm bg-muted' : undefined}>
      <EquationBody element={props.element} tex={tex} displayMode={false} />
      {props.children}
    </PlateElement>
  )
}

type ListProps = PlateElementProps & { lineBreakBadge?: ReactNode }

/** Ordered and todo lists need a real list wrapper. Bullets use Plate's list-item inject. */
export const BlockList: RenderNodeWrapper = (props) => {
  const styleType = props.element.listStyleType as string | undefined
  if (styleType === undefined || styleType === '') return
  if (!isOrderedList(props.element) && styleType !== 'todo') return
  return (childProps: ListProps) => <List {...childProps} />
}

function List(props: ListProps): ReactNode {
  const { listStart, listStyleType } = props.element as TListElement
  const isTodo = listStyleType === 'todo'
  const Tag = isOrderedList(props.element) ? 'ol' : 'ul'
  return (
    <Tag
      className={isTodo ? 'relative m-0 list-none p-0' : 'relative m-0 list-outside py-0 ps-[1.5em]'}
      style={{ listStyleType: isTodo ? 'none' : listStyleType }}
      start={listStart}
    >
      {isTodo ? <TodoLi {...props} /> : <li className="ps-0">{props.children}</li>}
    </Tag>
  )
}

function TodoLi(props: ListProps): ReactNode {
  const state = useTodoListElementState({ element: props.element })
  const { checkboxProps } = useTodoListElement(state)
  const readOnly = useReadOnly()
  return (
    <li className={props.element.checked === true ? 'relative list-none text-muted-foreground line-through' : 'relative list-none'}>
      <div contentEditable={false} className="absolute top-0 -left-6 flex h-[1lh] w-4 items-center justify-center">
        <input
          type="checkbox"
          className="size-3.5"
          checked={checkboxProps.checked}
          disabled={readOnly}
          onMouseDown={checkboxProps.onMouseDown}
          onChange={(event) => { checkboxProps.onCheckedChange(event.target.checked) }}
        />
      </div>
      {props.children}
    </li>
  )
}
