import {
  BlockquoteRules,
  BoldRules,
  CodeRules,
  HeadingRules,
  HorizontalRuleRules,
  ItalicRules,
  StrikethroughRules,
} from '@platejs/basic-nodes'
import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  HorizontalRulePlugin,
  ItalicPlugin,
  StrikethroughPlugin,
} from '@platejs/basic-nodes/react'
import { CodeBlockRules } from '@platejs/code-block'
import { CodeBlockPlugin, CodeLinePlugin, CodeSyntaxPlugin } from '@platejs/code-block/react'
import { FindReplacePlugin } from '@platejs/find-replace'
import { IndentPlugin } from '@platejs/indent/react'
import { LinkPlugin } from '@platejs/link/react'
import { BulletedListRules, isOrderedList, OrderedListRules, TaskListRules } from '@platejs/list'
import { ListPlugin } from '@platejs/list/react'
import { MarkdownPlugin } from '@platejs/markdown'
import { MathRules } from '@platejs/math'
import { EquationPlugin, InlineEquationPlugin } from '@platejs/math/react'
import { TableCellHeaderPlugin, TableCellPlugin, TablePlugin, TableRowPlugin } from '@platejs/table/react'
import { common, createLowlight } from 'lowlight'
import { KEYS, TrailingBlockPlugin, type AnyPluginConfig } from 'platejs'
import { ParagraphPlugin } from 'platejs/react'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import {
  BlockList,
  BlockquoteElement,
  CodeBlockElement,
  CodeLeaf,
  CodeLineElement,
  CodeSyntaxLeaf,
  EquationElement,
  H1Element,
  H2Element,
  H3Element,
  H4Element,
  H5Element,
  H6Element,
  HrElement,
  InlineEquationElement,
  LinkElement,
  ParagraphElement,
  SearchLeaf,
  TableCellElement,
  TableCellHeaderElement,
  TableElement,
  TableRowElement,
} from './plate-nodes'

const lowlight = createLowlight(common)

export const noteFindPlugin = FindReplacePlugin.configure({
  node: { component: SearchLeaf },
})

const listTargets = [
  ...KEYS.heading,
  KEYS.p,
  KEYS.blockquote,
  KEYS.codeBlock,
]

const headingBreak = { break: { empty: 'reset' } } as const

/** Plate nodes that round-trip through Markdown. Desktop-only kits stay out. */
export const notePlugins = [
  ParagraphPlugin.withComponent(ParagraphElement),
  H1Plugin.configure({ inputRules: [HeadingRules.markdown()], node: { component: H1Element }, rules: headingBreak }),
  H2Plugin.configure({ inputRules: [HeadingRules.markdown()], node: { component: H2Element }, rules: headingBreak }),
  H3Plugin.configure({ inputRules: [HeadingRules.markdown()], node: { component: H3Element }, rules: headingBreak }),
  H4Plugin.configure({ inputRules: [HeadingRules.markdown()], node: { component: H4Element }, rules: headingBreak }),
  H5Plugin.configure({ inputRules: [HeadingRules.markdown()], node: { component: H5Element }, rules: headingBreak }),
  H6Plugin.configure({ inputRules: [HeadingRules.markdown()], node: { component: H6Element }, rules: headingBreak }),
  BlockquotePlugin.configure({
    inputRules: [BlockquoteRules.markdown()],
    node: { component: BlockquoteElement },
  }),
  HorizontalRulePlugin.configure({
    inputRules: [
      HorizontalRuleRules.markdown({ variant: '-' }),
      HorizontalRuleRules.markdown({ variant: '_' }),
    ],
    node: { component: HrElement },
  }),
  BoldPlugin.configure({
    inputRules: [BoldRules.markdown({ variant: '*' }), BoldRules.markdown({ variant: '_' })],
  }),
  ItalicPlugin.configure({
    inputRules: [ItalicRules.markdown({ variant: '*' }), ItalicRules.markdown({ variant: '_' })],
  }),
  StrikethroughPlugin.configure({ inputRules: [StrikethroughRules.markdown()] }),
  CodePlugin.configure({ inputRules: [CodeRules.markdown()], node: { component: CodeLeaf } }),
  IndentPlugin.configure({
    inject: { targetPlugins: listTargets },
    options: { offset: 1.5, unit: 'rem' },
  }),
  ListPlugin.configure({
    inputRules: [
      BulletedListRules.markdown({ variant: '-' }),
      BulletedListRules.markdown({ variant: '*' }),
      OrderedListRules.markdown({ variant: '.' }),
      OrderedListRules.markdown({ variant: ')' }),
      TaskListRules.markdown({ checked: false }),
      TaskListRules.markdown({ checked: true }),
    ],
    inject: {
      nodeProps: {
        nodeKey: KEYS.listType,
        query: ({ nodeProps }) => {
          const element = nodeProps.element
          if (element?.listStyleType === undefined || element.listStyleType === '') return false
          if (isOrderedList(element)) return false
          if (element.listStyleType === 'todo') return false
          return true
        },
        transformProps: ({ props }) => ({
          ...props,
          role: 'listitem',
          style: { ...props.style, display: 'list-item', listStylePosition: 'outside' },
        }),
      },
      targetPlugins: listTargets,
    },
    render: { belowNodes: BlockList },
  }),
  CodeBlockPlugin.configure({
    inputRules: [CodeBlockRules.markdown({ on: 'match' })],
    node: { component: CodeBlockElement },
    options: { lowlight },
  }),
  CodeLinePlugin.withComponent(CodeLineElement),
  CodeSyntaxPlugin.withComponent(CodeSyntaxLeaf),
  TablePlugin.withComponent(TableElement),
  TableRowPlugin.withComponent(TableRowElement),
  TableCellPlugin.withComponent(TableCellElement),
  TableCellHeaderPlugin.withComponent(TableCellHeaderElement),
  InlineEquationPlugin.configure({ node: { component: InlineEquationElement } }),
  EquationPlugin.configure({
    inputRules: [MathRules.markdown({ on: 'break', variant: '$$' })],
    node: { component: EquationElement },
  }),
  LinkPlugin.configure({ node: { component: LinkElement } }),
  noteFindPlugin,
  TrailingBlockPlugin.configure({ options: { type: KEYS.p } }),
  MarkdownPlugin.configure({
    options: {
      remarkPlugins: [remarkMath, remarkGfm],
    },
  }),
] as AnyPluginConfig[]
