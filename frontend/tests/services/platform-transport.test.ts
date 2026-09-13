import { describe, expect, it, vi, afterEach } from 'vitest'
import { assertPlatformTransport, productionPlatformUrl } from '../../src/shared/platform-transport'
import { PlatformClient } from '../../src/main/services/platform-client'
import { routeService } from '../../src/main/services/service-routing'
import { defaultSettings } from '../../src/shared/defaults'

afterEach(() => vi.unstubAllGlobals())
describe('platform TLS boundary', () => {
  it.each(['http://203.0.113.10:8080', 'http://example.com', 'http://192.168.1.1', 'http://localhost.example.com', 'ws://example.com'])('rejects insecure remote address %s before a request', address => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(() => new PlatformClient(address)).toThrow('HTTPS')
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([productionPlatformUrl, 'http://127.0.0.1:8080', 'http://localhost:8080', 'http://[::1]:8080'])('accepts TLS or explicit loopback %s', address => {
    expect(() => assertPlatformTransport(address)).not.toThrow()
  })
  it('routes platform ASR over WSS and rejects the old HTTP origin', () => {
    const settings = structuredClone(defaultSettings)
    settings.platform = { ...settings.platform!, enabled: true, authenticated: true, advancedSettingsEnabled: true,
      baseUrl: productionPlatformUrl, expiresAt: new Date(Date.now() + 60000).toISOString(),
      capabilities: { asr: true, llm: true, knowledge: true } }
    const secrets = { platformAccessToken: 'test-token', asrApiKey: '', llmApiKey: '', remoteKnowledgeApiKey: '' }
    expect(routeService(settings, secrets, 'asr').settings.asr.url).toBe('wss://api.junshi.icu/api/v1/asr')
    settings.platform.baseUrl = 'http://203.0.113.10:8080'
    expect(() => routeService(settings, secrets, 'asr')).toThrow('HTTPS')
  })
})
