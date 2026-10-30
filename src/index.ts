import type { Context } from '@deepseek-ai/cordis'

export const name = 'agentero'

export function apply(ctx: Context) {
  ctx.effect(() => {
    console.log('[agentero] plugin loaded')
    return () => {
      console.log('[agentero] plugin unloaded')
    }
  })
}
