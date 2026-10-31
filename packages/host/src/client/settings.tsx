/** Agentero's section in the dsh Settings dialog. */
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AgenteroSettingsFace } from './settings-model'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'

export type AgenteroSettingsProps =
  PropsLocale<'agentero.settings'>
  & InjectFace<AgenteroSettingsFace>

export type SettingsLocaleKey =
  | 'nav' | 'cliTitle' | 'cliPlaceholder' | 'save' | 'saving' | 'saved'
  | 'saveFailed' | 'reset' | 'unavailable'

export const en: Record<SettingsLocaleKey, string> = {
  nav: 'Agentero',
  cliTitle: 'Agentero CLI',
  cliPlaceholder: 'agentero',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  saveFailed: 'The Host did not accept this change.',
  reset: 'Reset to default',
  unavailable: 'These settings are not available in this deployment.',
}

export const zh: Record<SettingsLocaleKey, string> = {
  nav: 'Agentero',
  cliTitle: 'Agentero CLI',
  cliPlaceholder: 'agentero',
  save: '保存',
  saving: '保存中…',
  saved: '已保存',
  saveFailed: 'Host 没有接受这次修改。',
  reset: '恢复默认',
  unavailable: '当前部署不提供这项设置。',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'agentero.settings': SettingsLocaleKey
  }
}

/** Render the CLI path inside the Settings dialog. */
export function AgenteroSettings(props: AgenteroSettingsProps) {
  const { t } = props
  const state = props.useAgenteroSettings(snapshot => snapshot)
  const [saved, setSaved] = useState(false)
  const saving = useRef(false)

  useEffect(() => {
    if (state.saving) {
      saving.current = true
      setSaved(false)
      return
    }
    if (!saving.current) return
    saving.current = false
    if (!state.failed) setSaved(true)
  }, [state.saving, state.failed])

  const disabled = !state.writable || state.saving

  return <div className="agentero-settings agentero-surface flex flex-col gap-2 py-1">
    <h3 className="text-sm font-medium">{t('cliTitle')}</h3>
    {!state.available
      ? <p role="status" className="text-xs text-muted-foreground">{t('unavailable')}</p>
      : <div className="flex items-center gap-2">
        <Input
          value={state.agenteroBin.text}
          aria-label={t('cliTitle')}
          placeholder={t('cliPlaceholder')}
          spellCheck={false}
          disabled={disabled}
          className="font-mono text-xs"
          onChange={(event) => { props.edit('agenteroBin', event.target.value); setSaved(false) }}
        />
        {state.agenteroBin.overridden
          ? <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { props.resetField('agenteroBin'); setSaved(false) }}>{t('reset')}</Button>
          : null}
        <Button type="button" size="sm" disabled={disabled || !state.dirty || state.invalid} onClick={() => { props.save() }}>
          {state.saving ? t('saving') : t('save')}
        </Button>
      </div>}
    {state.failed ? <p role="status" className="text-xs text-destructive">{t('saveFailed')}</p> : null}
    {saved && !state.failed ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><Check className="size-3" aria-hidden />{t('saved')}</p> : null}
  </div>
}
