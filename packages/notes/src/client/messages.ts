import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

type Translate = PropsLocale<'agentero.notes'>['t']

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function shown(message: string, fallback: string, t: Translate): string {
  if (message === 'vault is not configured') return t('vaultMissing')
  if (message === 'not found') return t('missing')
  if (message === 'invalid path' || message === 'invalid body' || message === 'invalid notes response') {
    return t('invalid')
  }
  if (message === '') return fallback
  return message
}
