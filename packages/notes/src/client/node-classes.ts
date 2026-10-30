import { cva } from 'class-variance-authority'

/**
 * Heading scale from `editor/nodes/block/heading-node.tsx`.
 * Sizes step down with `@container/editor`.
 */
export const headingVariants = cva(
  'relative mb-1 transition-colors duration-300 data-[nav-target=true]:rounded-md data-[nav-target=true]:bg-highlight/20',
  {
    variants: {
      variant: {
        h1: 'mt-6 pb-1 font-bold font-heading text-4xl @max-sm/editor:text-3xl @max-2xs/editor:text-2xl',
        h2: 'mt-6 pb-px font-heading font-semibold text-2xl tracking-tight @max-2xs/editor:text-xl',
        h3: 'mt-6 pb-px font-heading font-semibold text-xl tracking-tight @max-2xs/editor:text-lg',
        h4: 'mt-4 font-heading font-semibold text-lg tracking-tight',
        h5: 'mt-4 font-semibold text-lg tracking-tight',
        h6: 'mt-4 font-semibold text-base tracking-tight',
      },
    },
  },
)

/** `editor/nodes/block/paragraph-node.tsx` */
export const paragraphClassName = 'relative m-0 px-0 py-1'

/** `editor/nodes/block/blockquote-node.tsx` */
export const blockquoteClassName = 'relative my-1 border-l-2 pl-6 italic'

/** `editor/nodes/block/hr-node.tsx` rule, without the selection ring. */
export const hrClassName = 'h-0.5 rounded-sm border-none bg-muted bg-clip-content'

/**
 * Ordered-list wrapper from `editor/nodes/block/list-node.tsx`.
 * `listStyleType` is set inline, the same way Plate does.
 */
export const listClassName = 'relative m-0 list-outside py-0 ps-[1.5em]'

export const listItemClassName = 'ps-0'

/** `editor/nodes/inline/link-styles.ts` */
export const linkClassName =
  'cursor-pointer font-medium text-primary underline decoration-primary/40 underline-offset-2'

/** `editor/nodes/leaf/index.tsx` CodeLeaf */
export const codeLeafClassName =
  'whitespace-pre-wrap rounded-md bg-muted px-[0.3em] py-[0.2em] font-mono text-sm'

/** `editor/nodes/block/code-block-node.tsx` chrome, without the language picker. */
export const codeBlockWrapClassName = 'max-w-full min-w-0 py-1'

export const codeBlockClassName =
  'agentero-codeblock group relative max-w-full min-w-0 overflow-hidden rounded-md bg-muted/50'

export const codeBlockPreClassName =
  'agentero-scroll-both agentero-scroll-x-only max-w-full overflow-x-auto p-4 font-mono text-sm leading-[normal] whitespace-pre [tab-size:2]'

export const codeBlockCodeClassName = 'block w-max min-w-full'
