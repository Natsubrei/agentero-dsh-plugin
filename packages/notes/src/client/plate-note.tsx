import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ListStyleType, toggleList } from '@platejs/list'
import { insertTable } from '@platejs/table'
import { MarkdownPlugin } from '@platejs/markdown'
import {
  Bold,
  Code,
  Heading2,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Radical,
  Search,
  Strikethrough,
  Table,
} from 'lucide-react'
import { ElementApi, KEYS, NodeApi, type TElement, type TRange } from 'platejs'
import {
  Plate,
  PlateContent,
  useEditorRef,
  usePlateEditor,
  type PlateEditor,
} from 'platejs/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { TooltipProvider } from './tooltip'
import { editorClassName, editorContainerClassName, editorContentClassName, editorTextStyle } from './editor-surface'
import { noteFindPlugin, notePlugins } from './plate-kit'
import { Toolbar, ToolbarButton } from './toolbar'

type NotesT = PropsLocale<'agentero.notes'>['t']

function slateValue(editor: PlateEditor, markdown: string) {
  const source = markdown.trim() === '' ? '\n' : markdown
  try {
    return editor.getApi(MarkdownPlugin).markdown.deserialize(source)
  } catch {
    return [{ children: [{ text: source }], type: KEYS.p }]
  }
}

function markdownOf(editor: PlateEditor): string {
  return editor.getApi(MarkdownPlugin).markdown.serialize()
}

function findMatches(editor: PlateEditor, search: string): TRange[] {
  const query = search.trim().toLowerCase()
  if (query === '') return []
  const matches: TRange[] = []
  for (const [node, path] of editor.api.nodes({
    at: [],
    match: (candidate) => ElementApi.isElement(candidate) && editor.api.isBlock(candidate),
  })) {
    const block = node as TElement
    if (block.children.some((child) => ElementApi.isElement(child) && editor.api.isBlock(child))) continue
    const texts = [...NodeApi.texts(block)]
    if (texts.length === 0) continue
    const bounds: { path: number[], start: number, end: number }[] = []
    let pos = 0
    for (const [text, relative] of texts) {
      bounds.push({ path: [...path, ...relative], start: pos, end: pos + text.text.length })
      pos += text.text.length
    }
    const content = texts.map(([text]) => text.text).join('').toLowerCase()
    let index = content.indexOf(query)
    while (index !== -1) {
      const end = index + query.length
      const pointAt = (offset: number) => {
        const segment = bounds.find((item) => offset <= item.end) ?? bounds[bounds.length - 1]
        return { offset: offset - (segment?.start ?? 0), path: segment?.path ?? path }
      }
      matches.push({ anchor: pointAt(index), focus: pointAt(end) })
      index = content.indexOf(query, end)
    }
  }
  return matches
}

export function PlateNote({
  markdown,
  placeholder,
  onMarkdown,
  t,
}: {
  markdown: string
  placeholder?: string
  onMarkdown: (value: string) => void
  t: NotesT
}): ReactNode {
  const editor = usePlateEditor({
    plugins: notePlugins,
    value: (next) => slateValue(next, markdown),
  }, [])
  const baseline = useRef<string | null>(null)
  const [findOpen, setFindOpen] = useState(false)

  useEffect(() => {
    baseline.current = markdownOf(editor)
  }, [editor])

  return (
    <Plate
      editor={editor}
      onChange={() => {
        if (baseline.current === null) return
        const next = markdownOf(editor)
        if (next === baseline.current) return
        baseline.current = next
        onMarkdown(next)
      }}
    >
      <NoteSurface findOpen={findOpen} placeholder={placeholder} t={t} onFind={setFindOpen} />
    </Plate>
  )
}

function NoteSurface({
  findOpen,
  placeholder,
  t,
  onFind,
}: {
  findOpen: boolean
  placeholder?: string
  t: NotesT
  onFind: (open: boolean) => void
}): ReactNode {
  const [focused, setFocused] = useState(false)
  return (
    <div className="@container/editor relative min-h-0 flex-1" style={editorTextStyle}>
      <PlateContent
        className={`${editorContainerClassName} ${editorClassName} ${editorContentClassName}`}
        placeholder={placeholder}
        onFocus={() => { setFocused(true) }}
        onBlur={(event) => {
          const next = event.relatedTarget
          if (next instanceof Node && event.currentTarget.parentElement?.contains(next)) return
          setFocused(false)
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
            event.preventDefault()
            onFind(true)
          }
          if (event.key === 'Escape') onFind(false)
        }}
      />
      {focused ? <NoteFormatBar t={t} onFind={() => { onFind(true) }} /> : null}
      {findOpen ? <FindBar t={t} onClose={() => { onFind(false) }} /> : null}
    </div>
  )
}

function NoteFormatBar({ t, onFind }: { t: NotesT, onFind: () => void }): ReactNode {
  const editor = useEditorRef()
  const run = (apply: () => void): void => {
    editor.tf.focus()
    apply()
  }

  return (
    <div className="absolute inset-x-2 bottom-2 z-10">
      <TooltipProvider>
        <Toolbar className="flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-background px-1 py-0.5 shadow-sm">
              <FormatButton label={t('bold')} onClick={() => { run(() => { editor.tf.toggleMark(KEYS.bold) }) }}>
                <Bold />
              </FormatButton>
              <FormatButton label={t('italic')} onClick={() => { run(() => { editor.tf.toggleMark(KEYS.italic) }) }}>
                <Italic />
              </FormatButton>
              <FormatButton label={t('strike')} onClick={() => { run(() => { editor.tf.toggleMark(KEYS.strikethrough) }) }}>
                <Strikethrough />
              </FormatButton>
              <FormatButton label={t('code')} onClick={() => { run(() => { editor.tf.toggleMark(KEYS.code) }) }}>
                <Code />
              </FormatButton>
              <BarGap />
              <FormatButton label={t('heading')} onClick={() => { run(() => { editor.tf.toggleBlock(KEYS.h2) }) }}>
                <Heading2 />
              </FormatButton>
              <FormatButton label={t('bulletList')} onClick={() => { run(() => { toggleList(editor, { listStyleType: ListStyleType.Disc }) }) }}>
                <List />
              </FormatButton>
              <FormatButton label={t('numberedList')} onClick={() => { run(() => { toggleList(editor, { listStyleType: ListStyleType.Decimal }) }) }}>
                <ListOrdered />
              </FormatButton>
              <FormatButton label={t('quote')} onClick={() => { run(() => { editor.tf.toggleBlock(KEYS.blockquote) }) }}>
                <Quote />
              </FormatButton>
              <BarGap />
              <FormatButton label={t('link')} onClick={() => { run(() => { insertLink(editor) }) }}>
                <Link />
              </FormatButton>
              <FormatButton label={t('table')} onClick={() => { run(() => { insertTable(editor, { rowCount: 3, colCount: 3 }) }) }}>
                <Table />
              </FormatButton>
              <FormatButton label={t('equation')} onClick={() => { run(() => {
                editor.tf.insertNodes({
                  type: KEYS.equation,
                  texExpression: 'E = mc^2',
                  children: [{ text: '' }],
                })
              }) }}>
                <Radical />
              </FormatButton>
              <BarGap />
              <FormatButton label={t('find')} onClick={onFind}>
                <Search />
              </FormatButton>
        </Toolbar>
      </TooltipProvider>
    </div>
  )
}

function BarGap(): ReactNode {
  return <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
}

function FormatButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}): ReactNode {
  return (
    <ToolbarButton tooltip={label} aria-label={label} onMouseDown={(event) => { event.preventDefault() }} onClick={onClick}>
      {children}
    </ToolbarButton>
  )
}

function insertLink(editor: PlateEditor): void {
  const selected = editor.api.string(editor.selection ?? undefined).trim()
  const url = window.prompt('https://', selected.startsWith('http') ? selected : 'https://')
  if (url === null || url.trim() === '') return
  editor.tf.insertNodes({
    type: KEYS.a,
    url: url.trim(),
    children: [{ text: selected === '' ? url.trim() : selected }],
  })
}

function FindBar({ t, onClose }: { t: NotesT, onClose: () => void }): ReactNode {
  const editor = useEditorRef()
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [index, setIndex] = useState(0)
  const matches = findMatches(editor, query)
  const current = matches.length === 0 ? -1 : index % matches.length

  useEffect(() => {
    editor.setOption(noteFindPlugin, 'search', query.trim())
    editor.api.redecorate()
    return () => {
      editor.setOption(noteFindPlugin, 'search', '')
      editor.api.redecorate()
    }
  }, [editor, query])

  const go = (target: number): void => {
    if (matches.length === 0) return
    const next = (target + matches.length) % matches.length
    const range = matches[next]
    if (range === undefined) return
    setIndex(next)
    editor.tf.select(range)
    const node = editor.api.node(range.anchor)?.[0]
    if (node !== undefined) editor.api.toDOMNode(node)?.scrollIntoView({ block: 'nearest' })
  }

  const replaceCurrent = (): void => {
    const range = matches[current]
    if (range === undefined) return
    editor.tf.select(range)
    editor.tf.insertText(replacement)
    setIndex(current)
  }

  const replaceAll = (): void => {
    editor.tf.withoutNormalizing(() => {
      for (const range of [...matches].reverse()) editor.tf.insertText(replacement, { at: range })
    })
  }

  useEffect(() => {
    document.querySelector<HTMLInputElement>('[data-note-find]')?.focus()
  }, [])

  return (
    <div className="absolute end-3 top-2 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1 rounded-md border border-border bg-background px-1.5 py-1 shadow-sm">
      <input
        data-note-find
        value={query}
        aria-label={t('find')}
        placeholder={t('find')}
        className="h-7 w-28 rounded-md border border-border bg-transparent px-2 text-sm outline-none"
        onChange={(event) => {
          setQuery(event.target.value)
          setIndex(0)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            go(event.shiftKey ? current - 1 : current + 1)
          }
        }}
      />
      <span className="text-muted-foreground text-xs">{matches.length === 0 ? '0' : `${current + 1}/${matches.length}`}</span>
      <TextButton label={t('findPrevious')} onClick={() => { go(current - 1) }} />
      <TextButton label={t('findNext')} onClick={() => { go(current + 1) }} />
      <input
        value={replacement}
        aria-label={t('replace')}
        placeholder={t('replace')}
        className="h-7 w-28 rounded-md border border-border bg-transparent px-2 text-sm outline-none"
        onChange={(event) => { setReplacement(event.target.value) }}
      />
      <TextButton label={t('replaceOne')} onClick={replaceCurrent} />
      <TextButton label={t('replaceAll')} onClick={replaceAll} />
    </div>
  )
}

function TextButton({ label, onClick }: { label: string, onClick: () => void }): ReactNode {
  return (
    <button type="button" className="h-7 rounded-md border-0 bg-transparent px-1.5 text-muted-foreground text-xs shadow-none hover:bg-muted hover:text-foreground" onMouseDown={(event) => { event.preventDefault() }} onClick={onClick}>
      {label}
    </button>
  )
}
