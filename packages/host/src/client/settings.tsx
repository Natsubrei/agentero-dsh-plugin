/** Agentero's section in the dsh Settings dialog. */
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Check, FolderOpen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AgenteroSettingsFace } from './settings-model'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'

/** Vault facts the page reads before offering the native picker. */
export interface SettingsVault {
  path: string
  canPick: boolean
}

/** Host calls the page uses for the vault; the CLI field persists through the form face. */
export interface SettingsFace {
  loadVault(): Promise<SettingsVault>
  pickVault(): Promise<string | null>
  saveVault(path: string): Promise<void>
  reload(): void
}

export type AgenteroFace = SettingsFace & AgenteroSettingsFace

export type AgenteroSettingsProps =
  PropsLocale<'agentero.settings'>
  & InjectFace<AgenteroFace>

export type SettingsLocaleKey =
  | 'nav' | 'vaultTitle' | 'vaultPlaceholder' | 'choose' | 'apply' | 'applying' | 'invalidVault'
  | 'cliTitle' | 'cliPlaceholder' | 'save' | 'saving' | 'saved' | 'saveFailed' | 'reset'
  | 'loadFailed' | 'unavailable'

export const en: Record<SettingsLocaleKey, string> = {
  nav: 'Agentero',
  vaultTitle: 'Knowledge base',
  vaultPlaceholder: '/path/to/vault',
  choose: 'Choose folder',
  apply: 'Apply',
  applying: 'Applying…',
  invalidVault: 'Choose an existing Agentero Vault folder.',
  cliTitle: 'Agentero CLI',
  cliPlaceholder: 'agentero',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  saveFailed: 'The Host did not accept this change.',
  reset: 'Reset to default',
  loadFailed: 'Could not read the current knowledge base.',
  unavailable: 'These settings are not available in this deployment.',
}

export const zh: Record<SettingsLocaleKey, string> = {
  nav: 'Agentero',
  vaultTitle: '知识库',
  vaultPlaceholder: '/path/to/vault',
  choose: '选择目录',
  apply: '应用',
  applying: '应用中…',
  invalidVault: '请选择一个有效的 Agentero Vault 目录。',
  cliTitle: 'Agentero CLI',
  cliPlaceholder: 'agentero',
  save: '保存',
  saving: '保存中…',
  saved: '已保存',
  saveFailed: 'Host 没有接受这次修改。',
  reset: '恢复默认',
  loadFailed: '无法读取当前知识库。',
  unavailable: '当前部署不提供这项设置。',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'agentero.settings': SettingsLocaleKey
  }
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== '' ? error.message : fallback
}

/** Render the knowledge base and CLI fields inside the Settings dialog. */
export function AgenteroSettings(props: AgenteroSettingsProps) {
  const { t } = props
  const state = props.useAgenteroSettings(snapshot => snapshot)
  const [vault, setVault] = useState('')
  const [vaultDraft, setVaultDraft] = useState('')
  const [canPick, setCanPick] = useState(false)
  const [picking, setPicking] = useState(false)
  const [applying, setApplying] = useState(false)
  const [vaultError, setVaultError] = useState('')
  const [saved, setSaved] = useState(false)
  const saving = useRef(false)

  useEffect(() => {
    let cancelled = false
    props.loadVault().then((info) => {
      if (cancelled) return
      setVault(info.path)
      setVaultDraft(info.path)
      setCanPick(info.canPick)
    }).catch((error: unknown) => {
      if (!cancelled) setVaultError(messageOf(error, t('loadFailed')))
    })
    return () => { cancelled = true }
  }, [props.loadVault, t])

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

  const busy = picking || applying
  const draft = vaultDraft.trim()
  const vaultReady = draft !== '' && draft !== vault && !busy
  const disabled = !state.writable || state.saving

  const pick = async (): Promise<void> => {
    setPicking(true)
    setVaultError('')
    try {
      const path = await props.pickVault()
      if (path !== null) setVaultDraft(path)
    } catch (error) {
      setVaultError(messageOf(error, t('loadFailed')))
    } finally {
      setPicking(false)
    }
  }

  const applyVault = async (): Promise<void> => {
    if (!vaultReady) return
    setApplying(true)
    setVaultError('')
    try {
      await props.saveVault(draft)
      props.reload()
    } catch (error) {
      const message = messageOf(error, t('saveFailed'))
      setVaultError(message === 'invalid vault' ? t('invalidVault') : message)
    } finally {
      setApplying(false)
    }
  }

  return <div className="agentero-settings agentero-surface flex flex-col gap-6 py-1">
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-[0.875rem] font-normal">{t('vaultTitle')}</h3>
      <div className="flex items-center gap-2">
        <Input
          value={vaultDraft}
          aria-label={t('vaultTitle')}
          placeholder={t('vaultPlaceholder')}
          spellCheck={false}
          disabled={busy}
          className="font-mono text-xs"
          onChange={(event) => { setVaultDraft(event.target.value) }}
        />
        {canPick ? <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => { void pick() }}>
          <FolderOpen aria-hidden />{t('choose')}
        </Button> : null}
        <Button type="button" size="sm" disabled={!vaultReady} onClick={() => { void applyVault() }}>
          {applying ? t('applying') : t('apply')}
        </Button>
      </div>
      {vaultError !== '' ? <p role="status" className="text-xs text-destructive">{vaultError}</p> : null}
    </section>

    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-[0.875rem] font-normal">{t('cliTitle')}</h3>
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
    </section>
  </div>
}
