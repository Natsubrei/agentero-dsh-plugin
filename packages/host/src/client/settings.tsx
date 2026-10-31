/** The Agentero row's configuration page on the dsh Plugins page. */
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Check, FolderOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'

/** Vault facts the page reads before offering the native picker. */
export interface SettingsVault {
  path: string
  canPick: boolean
}

/** Host calls the page uses for the vault; the CLI field persists through `form`. */
export interface SettingsFace {
  loadVault(): Promise<SettingsVault>
  pickVault(): Promise<string | null>
  saveVault(path: string): Promise<void>
  reload(): void
}

export type AgenteroSettingsProps =
  PropsRuntime<'plugins.row.config'>
  & PropsLocale<'agentero.settings'>
  & InjectFace<SettingsFace>

export type SettingsLocaleKey =
  | 'summary' | 'vaultTitle' | 'vaultHint' | 'vaultPlaceholder' | 'choose' | 'apply' | 'applying'
  | 'cliTitle' | 'cliHint' | 'cliPlaceholder' | 'save' | 'saving' | 'saved' | 'saveFailed'
  | 'loadFailed' | 'invalidVault' | 'unavailable' | 'reloadHint'

export const en: Record<SettingsLocaleKey, string> = {
  summary: 'Knowledge base and Agentero CLI',
  vaultTitle: 'Knowledge base',
  vaultHint: 'Folder that holds your papers and notes. Switching reloads the page so every panel reads the new vault.',
  vaultPlaceholder: '/path/to/vault',
  choose: 'Choose folder',
  apply: 'Apply',
  applying: 'Applying…',
  cliTitle: 'Agentero CLI',
  cliHint: 'Executable that reads the vault. Leave empty to use agentero from PATH.',
  cliPlaceholder: 'agentero',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  saveFailed: 'The Host did not accept this change.',
  loadFailed: 'Could not read the current knowledge base.',
  invalidVault: 'Choose an existing Agentero Vault folder.',
  unavailable: 'These settings are not available in this deployment.',
  reloadHint: 'Applying a new folder reloads the page.',
}

export const zh: Record<SettingsLocaleKey, string> = {
  summary: '知识库与 Agentero CLI',
  vaultTitle: '知识库',
  vaultHint: '保存论文和笔记的 Vault 目录。切换后页面会刷新，让所有面板读取新的知识库。',
  vaultPlaceholder: '/path/to/vault',
  choose: '选择目录',
  apply: '应用',
  applying: '应用中…',
  cliTitle: 'Agentero CLI',
  cliHint: '读取知识库的可执行文件。留空则使用 PATH 里的 agentero。',
  cliPlaceholder: 'agentero',
  save: '保存',
  saving: '保存中…',
  saved: '已保存',
  saveFailed: 'Host 没有接受这次修改。',
  loadFailed: '无法读取当前知识库。',
  invalidVault: '请选择一个有效的 Agentero Vault 目录。',
  unavailable: '当前部署不提供这项设置。',
  reloadHint: '应用新目录后页面会刷新。',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'agentero.settings': SettingsLocaleKey
  }
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== '' ? error.message : fallback
}

/** Render the knowledge base and CLI fields as the Plugins page's row configuration body. */
export function AgenteroSettings(props: AgenteroSettingsProps) {
  const { t, form } = props
  const [vault, setVault] = useState('')
  const [vaultDraft, setVaultDraft] = useState('')
  const [canPick, setCanPick] = useState(false)
  const [picking, setPicking] = useState(false)
  const [applying, setApplying] = useState(false)
  const [vaultError, setVaultError] = useState('')
  const [bin, setBin] = useState('')
  const [binTouched, setBinTouched] = useState(false)
  const [savingBin, setSavingBin] = useState(false)
  const [binError, setBinError] = useState('')
  const [binSaved, setBinSaved] = useState(false)

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
    if (binTouched || form?.state.status !== 'ready' || form.state.value === undefined) return
    const value = form.state.value.agenteroBin
    setBin(typeof value === 'string' ? value : '')
  }, [binTouched, form])

  if (props.view === 'summary') return t('summary')

  const writable = form?.state.writable ?? false
  const busy = picking || applying
  const draft = vaultDraft.trim()
  const vaultReady = draft !== '' && draft !== vault && !busy

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

  const saveBin = async (): Promise<void> => {
    if (form === undefined) return
    setSavingBin(true)
    setBinError('')
    setBinSaved(false)
    try {
      const value = bin.trim()
      const ok = await form.mutate(value === ''
        ? [{ op: 'unset', path: ['agenteroBin'] }]
        : [{ op: 'set', path: ['agenteroBin'], value }], form.state.revision)
      if (ok) setBinSaved(true)
      else setBinError(t('saveFailed'))
    } catch (error) {
      setBinError(messageOf(error, t('saveFailed')))
    } finally {
      setSavingBin(false)
    }
  }

  return <div className="agentero-settings agentero-surface flex flex-col gap-6 py-1">
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium">{t('vaultTitle')}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('vaultHint')}</p>
      </div>
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
      {vaultError === '' && draft !== '' ? <p className="text-caption text-muted-foreground">{t('reloadHint')}</p> : null}
    </section>

    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium">{t('cliTitle')}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('cliHint')}</p>
      </div>
      {form === undefined || form.state.status === 'unavailable'
        ? <p role="status" className="text-xs text-muted-foreground">{t('unavailable')}</p>
        : <div className="flex items-center gap-2">
          <Input
            value={bin}
            aria-label={t('cliTitle')}
            placeholder={t('cliPlaceholder')}
            spellCheck={false}
            disabled={!writable || savingBin}
            className="font-mono text-xs"
            onChange={(event) => { setBinTouched(true); setBin(event.target.value); setBinSaved(false); setBinError('') }}
          />
          <Button type="button" size="sm" disabled={!writable || savingBin} onClick={() => { void saveBin() }}>
            {savingBin ? t('saving') : t('save')}
          </Button>
        </div>}
      {binError !== '' ? <p role="status" className="text-xs text-destructive">{binError}</p> : null}
      {binSaved ? <p className="flex items-center gap-1 text-xs text-muted-foreground"><Check className="size-3" aria-hidden />{t('saved')}</p> : null}
    </section>
  </div>
}
