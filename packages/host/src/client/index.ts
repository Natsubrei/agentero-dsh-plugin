import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { AgenteroSettings, en as settingsEn, zh as settingsZh } from './settings'
import { AgenteroSettingsModel, type AgenteroCliSettings } from './settings-model'

export interface VaultInfo {
  path: string
  name: string
  scope: string
  recentVaults: { path: string, name: string }[]
  canPick: boolean
}

/** Document a later panel can open. */
export type AgenteroOpenerKind = 'paper' | 'note'

/** Open one document id. The host does not register openers in this step. */
export type AgenteroOpener = (id: string) => void

/** Browser service other Agentero panels reach through `ctx.get('agentero')`. */
export interface AgenteroClient {
  getVault(): Promise<VaultInfo>
  /** Requests remain tied to the source opened by this page, even if another page switches vaults. */
  request(url: string, init?: RequestInit): Promise<Response>
  /**
   * Replace the opener for one kind.
   * @param kind - Document kind.
   * @param opener - Called by {@link AgenteroClient.open}.
   * @returns Disposer that removes this opener when it is still current.
   */
  registerOpener(kind: AgenteroOpenerKind, opener: AgenteroOpener): () => void
  /**
   * Open a document when an opener is registered.
   * @param kind - Document kind.
   * @param id - Document id.
   * @returns False when no opener is registered for `kind`.
   */
  open(kind: AgenteroOpenerKind, id: string): boolean
}

/** Owner props for the notes column beside a PDF page. */
export interface PdfNotesOwner {
  /** Vault-relative paper directory, for example `papers/1706.03762`. */
  paperPath: string
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'agentero.host': 'vaultChanged' | 'unavailable'
  }
  interface SlotMap {
    /**
     * Single notes column declared by the PDF panel.
     * The notes plugin fills it. An empty slot leaves the page full width.
     */
    'agentero.pdf.notes': {
      kind: 'single'
      scope: 'session'
      owner: PdfNotesOwner
    }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Agentero document openers. Panels register later. */
    agentero: AgenteroClient
  }
}

/** Browser plugin name. The service key is the same name. */
export const name = 'agentero'

/** Locale, slots, and the shared configuration form serve the panels and Settings. */
export const inject = ['slots', 'locale', 'configForms']

/** Settings section namespace in the Settings dialog. */
const SETTINGS_NS = 'agentero.settings'

/**
 * Provide the `agentero` service. Openers stay empty until a later step.
 * @param ctx - Browser plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('agentero.host', {
    en: {
      vaultChanged: 'The knowledge base has changed. Save any unsaved text elsewhere, then reload this page.',
      unavailable: 'Could not connect to the knowledge base.',
    },
    zh: {
      vaultChanged: '知识库已切换，请另存未保存的内容后刷新页面。',
      unavailable: '无法连接知识库。',
    },
  }))
  const t = ctx.locale.bind('agentero.host')
  let source: Promise<VaultInfo> | undefined
  const getVault = (): Promise<VaultInfo> => {
    source ??= fetch('/agentero/api/vault', { cache: 'no-store' }).then(async (response) => {
      // A missing route or a crash can answer with an empty body; reading JSON
      // directly would surface the browser's parser error as the toast.
      const text = await response.text()
      let body: unknown
      try {
        body = text.trim() === '' ? undefined : JSON.parse(text) as unknown
      } catch {
        body = undefined
      }
      if (!response.ok || body === null || typeof body !== 'object'
        || !('path' in body) || typeof body.path !== 'string'
        || !('scope' in body) || typeof body.scope !== 'string') throw new Error(t('unavailable'))
      return body as VaultInfo
    }).catch((error: unknown) => {
      source = undefined
      throw error
    })
    return source
  }
  const openers = new Map<AgenteroOpenerKind, AgenteroOpener>()
  const agentero: AgenteroClient = {
    getVault,
    async request(url, init) {
      const vault = await getVault()
      const headers = new Headers(init?.headers)
      headers.set('x-agentero-vault', vault.scope)
      const response = await fetch(url, { ...init, headers })
      if (response.status === 409) {
        const body = await response.clone().json() as { error?: unknown }
        if (body.error === 'vault changed') return new Response(JSON.stringify({ error: t('vaultChanged') }), {
          status: 409, headers: { 'content-type': 'application/json' },
        })
      }
      return response
    },
    registerOpener(kind, opener) {
      openers.set(kind, opener)
      return () => {
        if (openers.get(kind) === opener) openers.delete(kind)
      }
    },
    open(kind, id) {
      const opener = openers.get(kind)
      if (opener === undefined) return false
      opener(id)
      return true
    },
  }
  ctx.provide('agentero', agentero)
  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { en: settingsEn, zh: settingsZh }))
  const tSettings = ctx.locale.bind(SETTINGS_NS)
  const settingsModel = new AgenteroSettingsModel(ctx.configForms.get<AgenteroCliSettings>('agentero-host'))
  ctx.effect(() => () => { settingsModel.dispose() })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'agentero',
    order: 16,
    label: () => tSettings('nav'),
    locale: SETTINGS_NS,
    inject: () => settingsModel.inject(),
  }, AgenteroSettings))
}
