import { type ReactNode } from 'react'
import { cn } from './cn'
import {
  blockquoteClassName,
  codeBlockClassName,
  codeBlockCodeClassName,
  codeBlockPreClassName,
  codeBlockWrapClassName,
  codeLeafClassName,
  headingVariants,
  hrClassName,
  linkClassName,
  listClassName,
  listItemClassName,
  paragraphClassName,
} from './node-classes'

const HEADING_TAG = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

interface FenceOpen {
  char: string
  len: number
}

function fenceOpen(line: string): FenceOpen | undefined {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
  if (match === null) return undefined
  const marker = match[1] ?? ''
  const info = match[2] ?? ''
  if (marker.startsWith('`') && info.includes('`')) return undefined
  const char = marker[0]
  if (char !== '`' && char !== '~') return undefined
  return { char, len: marker.length }
}

function fenceClose(line: string, open: FenceOpen): boolean {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)
  if (match === null) return false
  const marker = match[1] ?? ''
  return marker[0] === open.char && marker.length >= open.len
}

function headingOf(line: string): { level: 1 | 2 | 3 | 4 | 5 | 6, text: string } | undefined {
  const match = /^ {0,3}(#{1,6})[ \t]+(.*)$/.exec(line)
  if (match === null) return undefined
  const marks = match[1] ?? ''
  const level = marks.length
  if (level < 1 || level > 6) return undefined
  const text = (match[2] ?? '').replace(/[ \t]+#+\s*$/, '').trim()
  return { level: level as 1 | 2 | 3 | 4 | 5 | 6, text }
}

function listItemOf(line: string): { ordered: boolean, text: string } | undefined {
  const ordered = /^ {0,3}\d{1,9}[.)][ \t]+(.*)$/.exec(line)
  if (ordered !== null) return { ordered: true, text: ordered[1] ?? '' }
  const bullet = /^ {0,3}[-*+][ \t]+(.*)$/.exec(line)
  if (bullet !== null) return { ordered: false, text: bullet[1] ?? '' }
  return undefined
}

function isHr(line: string): boolean {
  return /^ {0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line)
}

function quoteBody(line: string): string | undefined {
  const match = /^ {0,3}>([\t ]?(.*))?$/.exec(line)
  if (match === null) return undefined
  return match[2] ?? ''
}

function safeHref(raw: string): string | undefined {
  let url = raw.trim()
  if (url.startsWith('<')) {
    const end = url.indexOf('>')
    url = end === -1 ? url.slice(1) : url.slice(1, end)
  } else {
    url = url.split(/\s+/)[0] ?? ''
  }
  url = url.trim()
  if (url === '') return undefined
  const lower = url.toLowerCase()
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return undefined
  }
  return url
}

function tryLink(text: string, start: number): { label: string, href: string, end: number } | undefined {
  const labelEnd = text.indexOf(']', start + 1)
  if (labelEnd === -1 || text[labelEnd + 1] !== '(') return undefined
  const hrefEnd = text.indexOf(')', labelEnd + 2)
  if (hrefEnd === -1) return undefined
  const label = text.slice(start + 1, labelEnd)
  if (label === '') return undefined
  const href = safeHref(text.slice(labelEnd + 2, hrefEnd))
  if (href === undefined) return undefined
  return { label, href, end: hrefEnd + 1 }
}

function nextSpecial(text: string, from: number): number {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === '`') return index
    if (text[index] === '[' && text[index - 1] !== '[' && text[index - 1] !== '!') return index
  }
  return text.length
}

/** Inline code and markdown links. `[[wikilinks]]` stay literal text. */
function inlineNodes(text: string, nextKey: () => string): ReactNode[] {
  const parts: ReactNode[] = []
  let index = 0
  while (index < text.length) {
    if (text[index] === '`') {
      const close = text.indexOf('`', index + 1)
      if (close > index) {
        parts.push(
          <code key={nextKey()} className={codeLeafClassName}>
            {text.slice(index + 1, close)}
          </code>,
        )
        index = close + 1
        continue
      }
    }
    if (text[index] === '[' && text[index - 1] !== '[' && text[index - 1] !== '!') {
      const link = tryLink(text, index)
      if (link !== undefined) {
        const external = link.href.startsWith('http://') || link.href.startsWith('https://')
        parts.push(
          <a
            key={nextKey()}
            href={link.href}
            className={linkClassName}
            target={external ? '_blank' : undefined}
            rel={external ? 'noreferrer noopener' : undefined}
          >
            {link.label}
          </a>,
        )
        index = link.end
        continue
      }
    }
    const next = nextSpecial(text, index + 1)
    const slice = text.slice(index, next)
    if (slice !== '') parts.push(<span key={nextKey()}>{slice}</span>)
    index = next
  }
  return parts
}

function blocksBreak(line: string): boolean {
  return line.trim() === ''
    || fenceOpen(line) !== undefined
    || isHr(line)
    || headingOf(line) !== undefined
    || listItemOf(line) !== undefined
    || quoteBody(line) !== undefined
}

/** Headings, paragraphs, lists, fenced code, links, quotes, and rules. `[[...]]` stays literal text. */
export function NoteMarkdown({ text }: { text: string }): ReactNode {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const lines = source.split(/\r?\n/)
  const blocks: ReactNode[] = []
  let index = 0
  let key = 0
  const nextKey = (): string => {
    key += 1
    return String(key)
  }
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line.trim() === '') {
      index += 1
      continue
    }
    const fence = fenceOpen(line)
    if (fence !== undefined) {
      const body: string[] = []
      index += 1
      let closed = false
      while (index < lines.length && !fenceClose(lines[index] ?? '', fence)) {
        body.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length) {
        closed = true
        index += 1
      }
      if (!closed && body.length > 0 && body[body.length - 1] === '') body.pop()
      blocks.push(
        <div key={nextKey()} className={codeBlockWrapClassName}>
          <div className={codeBlockClassName}>
            <pre className={codeBlockPreClassName}>
              <code className={codeBlockCodeClassName}>{body.join('\n')}</code>
            </pre>
          </div>
        </div>,
      )
      continue
    }
    if (isHr(line)) {
      blocks.push(
        <div key={nextKey()} className="py-2">
          <hr className={hrClassName} />
        </div>,
      )
      index += 1
      continue
    }
    const heading = headingOf(line)
    if (heading !== undefined) {
      const Tag = HEADING_TAG[heading.level - 1]
      blocks.push(
        <Tag key={nextKey()} className={headingVariants({ variant: Tag })}>
          {inlineNodes(heading.text, nextKey)}
        </Tag>,
      )
      index += 1
      continue
    }
    const quoted = quoteBody(line)
    if (quoted !== undefined) {
      const quotedLines = [quoted]
      index += 1
      while (index < lines.length) {
        const next = quoteBody(lines[index] ?? '')
        if (next === undefined) break
        quotedLines.push(next)
        index += 1
      }
      const paragraphs: string[][] = []
      let current: string[] = []
      for (const entry of quotedLines) {
        if (entry.trim() === '') {
          if (current.length > 0) paragraphs.push(current)
          current = []
          continue
        }
        current.push(entry.trim())
      }
      if (current.length > 0) paragraphs.push(current)
      blocks.push(
        <blockquote key={nextKey()} className={blockquoteClassName}>
          {(paragraphs.length === 0 ? [['']] : paragraphs).map((paragraph) => (
            <p key={nextKey()} className={paragraphClassName}>
              {inlineNodes(paragraph.join(' '), nextKey)}
            </p>
          ))}
        </blockquote>,
      )
      continue
    }
    const item = listItemOf(line)
    if (item !== undefined) {
      const ordered = item.ordered
      const items = [item.text]
      index += 1
      while (index < lines.length) {
        const next = lines[index] ?? ''
        if (next.trim() === '') break
        const nextItem = listItemOf(next)
        if (nextItem === undefined || nextItem.ordered !== ordered) break
        items.push(nextItem.text)
        index += 1
      }
      const ListTag = ordered ? 'ol' : 'ul'
      blocks.push(
        <ListTag
          key={nextKey()}
          className={listClassName}
          style={{ listStyleType: ordered ? 'decimal' : 'disc' }}
        >
          {items.map((entry) => (
            <li key={nextKey()} className={listItemClassName}>
              <p className={paragraphClassName}>{inlineNodes(entry, nextKey)}</p>
            </li>
          ))}
        </ListTag>,
      )
      continue
    }
    const paragraph = [line.trim()]
    index += 1
    while (index < lines.length) {
      const next = lines[index] ?? ''
      if (blocksBreak(next)) break
      paragraph.push(next.trim())
      index += 1
    }
    blocks.push(
      <p key={nextKey()} className={paragraphClassName}>
        {inlineNodes(paragraph.join(' '), nextKey)}
      </p>,
    )
  }
  return <>{blocks}</>
}

export function EmptyNote({ children }: { children: ReactNode }): ReactNode {
  return <p className={cn(paragraphClassName, 'text-muted-foreground')}>{children}</p>
}
