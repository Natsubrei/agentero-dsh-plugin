/** Staged CLI field over the Host's `agentero-host` entry. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel, settingsTextField,
  type SettingsFieldState, type SettingsFormActions, type SettingsFormScope, type SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'

/** Fields this page edits; the knowledge base persists through its own validated route. */
export interface AgenteroCliSettings {
  agenteroBin?: string
}

/** Draft and shared form status. */
export interface AgenteroSettingsState extends SettingsFormShell {
  agenteroBin: SettingsFieldState
}

/** Registration-side observable and edit/save actions. */
export interface AgenteroSettingsFace extends SettingsFormActions {
  hooks: { agenteroSettings: SnapshotStore<AgenteroSettingsState> }
}

/** Stages CLI edits over the `agentero-host` namespace. */
export class AgenteroSettingsModel {
  private readonly form: SettingsFormModel<AgenteroCliSettings>
  private readonly state: SnapshotStore<AgenteroSettingsState>

  /** @param scope - the shared configuration form of the `agentero-host` entry. */
  constructor(scope: SettingsFormScope<AgenteroCliSettings>) {
    this.form = new SettingsFormModel(scope, [settingsTextField('agenteroBin')])
    this.state = this.form.bind(() => ({ ...this.form.shell(), agenteroBin: this.form.field('agenteroBin') }))
  }

  /** Build the face the settings section injects. */
  inject(): AgenteroSettingsFace {
    return { hooks: { agenteroSettings: this.state }, ...this.form.actions() }
  }

  /** Release the entry subscription. */
  dispose(): void { this.form.dispose() }
}
