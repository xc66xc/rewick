import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { Settings } from '../../shared/types'
import { SettingsStore } from './settings-store'
import { HistoryStore } from './history-store'
import { InterviewStore } from './interview-store'
import { ReferenceService } from './reference-service'
import { assertEmbeddingSelection } from './service-routing'
export function accountDirectory(root: string, userId: string): string {
  return join(root, 'accounts', createHash('sha256').update(userId).digest('hex'))
}
export interface AccountWorkspace { id: string; settings: SettingsStore; history: HistoryStore; interviews: InterviewStore; references: ReferenceService }
export class AccountWorkspaces {
  readonly context = new AsyncLocalStorage<AccountWorkspace>()
  active: AccountWorkspace | undefined
  private readonly stores = new Map<string, { settings: SettingsStore; history: HistoryStore; interviews: InterviewStore }>()
  constructor(private readonly root: string, private readonly crypto: ConstructorParameters<typeof SettingsStore>[1], private readonly changed: (workspaceId: string) => void) {}
  identity(settings: Settings): string | undefined {
    const platform = settings.platform
    return platform?.authenticated && platform.user ? accountDirectory(this.root, platform.user.id) : undefined
  }
  activate(settings: Settings): AccountWorkspace | undefined {
    const id = this.identity(settings)
    if (id === this.active?.id) return this.active
    this.active?.references.dispose()
    this.active = undefined
    if (!id) return undefined
    let stores = this.stores.get(id)
    if (!stores) {
      const privateSettings = new SettingsStore(id, this.crypto)
      stores = { settings: privateSettings, history: new HistoryStore(id),
        interviews: new InterviewStore(id, async () => ({ settings: await privateSettings.getSettings(), referenceIds: [] })) }
      this.stores.set(id, stores)
    }
    const own = stores
    const references = new ReferenceService(id, () => { if (this.active?.id === id) this.changed(id) }, async () => {
      const snapshot = await own.settings.getConnectionSnapshot()
      assertEmbeddingSelection(snapshot.settings)
      return { config: snapshot.settings.embedding, apiKey: snapshot.secrets.embeddingApiKey }
    })
    this.active = { id, ...own, references }
    return this.active
  }
  current(): AccountWorkspace {
    const current = this.context.getStore() ?? this.active
    if (!current) throw new Error('请先登录账户。')
    return current
  }
  dispose() { this.active?.references.dispose(); this.active = undefined }
}
