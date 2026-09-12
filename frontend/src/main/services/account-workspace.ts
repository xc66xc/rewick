import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { Settings } from '../../shared/types'
import { SettingsStore } from './settings-store'
import { ServerHistory } from './server-history'
import { InterviewStore } from './interview-store'
import { ReferenceService } from './reference-service'
export function accountDirectory(root: string, userId: string): string {
  return join(root, 'accounts', createHash('sha256').update(userId).digest('hex'))
}
export interface AccountWorkspace { id: string; settings: SettingsStore; history: ServerHistory; interviews: InterviewStore; references: ReferenceService }
export class AccountWorkspaces {
  readonly context = new AsyncLocalStorage<AccountWorkspace>()
  active: AccountWorkspace | undefined
  private readonly stores = new Map<string, { settings: SettingsStore; history: ServerHistory; interviews: InterviewStore }>()
  constructor(private readonly root: string, private readonly crypto: ConstructorParameters<typeof SettingsStore>[1], private readonly changed: (workspaceId: string) => void,
    private readonly authentication?: () => ReturnType<SettingsStore['getConnectionSnapshot']>,
    private readonly expired?: (token: string) => Promise<void>) {}
  identity(settings: Settings): string | undefined {
    const platform = settings.platform
    return platform?.authenticated && platform.user ? accountDirectory(this.root, platform.user.id) : undefined
  }
  activate(settings: Settings): AccountWorkspace | undefined {
    const id = this.identity(settings)
    if (id === this.active?.id) return this.active
    this.active?.references.dispose()
    this.active?.history.dispose()
    this.active = undefined
    if (!id) return undefined
    let stores = this.stores.get(id)
    if (!stores) {
      const privateSettings = new SettingsStore(id, this.crypto)
      stores = { settings: privateSettings, history: new ServerHistory(id, this.crypto, async () => {
        if (!this.authentication) throw new Error('请先登录。')
        const auth = await this.authentication()
        if (this.identity(auth.settings) !== id) throw new Error('账户已切换，请重新登录原账号同步。')
        return auth
      }),
        interviews: new InterviewStore(async () => {
          if (!this.authentication) throw new Error('请先登录账户。')
          const auth = await this.authentication()
          if (this.identity(auth.settings) !== id) throw new Error('账户已切换，请重试。')
          return auth
        }) }
      this.stores.set(id, stores)
    }
    const references = new ReferenceService(() => { if (this.active?.id === id) this.changed(id) }, async () => {
      if (!this.authentication) throw new Error('请先登录账户。')
      const auth = await this.authentication()
      if (this.identity(auth.settings) !== id) throw new Error('账户已切换，请重试。')
      return auth
    }, this.expired)
    this.active = { id, ...stores, references }
    this.active.history.start()
    return this.active
  }
  current(): AccountWorkspace {
    const current = this.context.getStore() ?? this.active
    if (!current) throw new Error('请先登录账户。')
    return current
  }
  dispose() { this.active?.history.dispose(); this.active?.references.dispose(); this.active = undefined }
}
