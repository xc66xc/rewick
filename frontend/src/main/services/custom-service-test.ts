import type { CustomServiceInput } from '../../shared/types'
import type { SettingsStore } from './settings-store'
import { AsrClient } from './asr-client'
import { LlmClient } from './llm-client'
import { RemoteKnowledgeClient } from './remote-knowledge-client'

export async function testCustomService(store: SettingsStore, input: CustomServiceInput, signal?: AbortSignal) {
  const { settings, apiKey } = await store.customServiceConnection(input)
  signal?.throwIfAborted()
  if (input.kind === 'llm') return new LlmClient(settings, apiKey, () => undefined).test(signal)
  if (input.kind === 'knowledge') return new RemoteKnowledgeClient({ ...settings.remoteKnowledge, enabled: true }, apiKey).test(signal)
  const started = performance.now()
  const client = new AsrClient(settings.asr, apiKey, () => undefined)
  const abort = () => client.dispose()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    signal?.throwIfAborted()
    await client.start()
    await client.stop()
    return { latencyMs: Math.round(performance.now() - started), message: '转写服务连接成功。' }
  } finally { signal?.removeEventListener('abort', abort); client.dispose() }
}
