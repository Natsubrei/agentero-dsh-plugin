import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'

type SessionId = Parameters<Context['sessions']['binding']>[0]

/** Bind PDF actions to their own sidebar session, even after navigation. */
export function pdfChatActions(ctx: Context, sessionId: SessionId) {
  return {
    async cite(text: string): Promise<void> {
      const binding = ctx.sessions.binding(sessionId)
      if (binding === undefined) throw new Error('')
      const result = ctx.conversation.input.requestDraftInitialization(binding, {
        prompt: text,
        whenDraftExists: 'append',
      })
      if (result !== 'applied') throw new Error('')
      ctx.conversation.input.for(binding.ctx).focus()
    },
    async ask(text: string): Promise<void> {
      const actx = ctx.sessions.scope(sessionId)
      // The borrowed session scope has its own dependency declarations.
      // Resolve through its public getter to keep the service session-bound.
      const conversation = actx?.get('conversation')
      if (conversation === undefined) throw new Error('')
      await conversation.send(text)
    },
  }
}
