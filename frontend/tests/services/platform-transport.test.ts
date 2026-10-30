import { describe, expect, it, vi, afterEach } from 'vitest'
import { assertPlatformTransport, productionPlatformUrl } from '../../src/shared/platform-transport'
import { PlatformClient } from '../../src/main/services/platform-client'
import { routeService } from '../../src/main/services/service-routing'
import { defaultSettings } from '../../src/shared/defaults'

afterEach(() => vi.unstubAllGlobals())
describe('platform transport boundary', () => {
  it.each(['http://example.com', 'http://localhost.example.com', 'http://203.0.113.10.example.com', 'ws://example.com'])('rejects insecure domain address %s before a request', address => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(() => new PlatformClient(address)).toThrow('HTTPS')
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([productionPlatformUrl, 'http://203.0.113.10:8080', 'http://192.168.1.1', 'http://[2001:db8::1]:8080', 'http://127.0.0.1:8080', 'http://localhost:8080', 'http://[::1]:8080'])('accepts TLS, explicit IP or localhost %s', address => {
    expect(() => assertPlatformTransport(address)).not.toThrow()
  })
  it.each(['http://user:password@203.0.113.10', 'http://203.0.113.10?token=x', 'http://203.0.113.10#fragment', 'http://999.999.999.999'])('rejects malformed or credential-bearing IP address %s', address => {
    expect(() => assertPlatformTransport(address)).toThrow()
  })
  it('routes HTTPS ASR over WSS and explicit HTTP IP ASR over WS', () => {
    const settings = structuredClone(defaultSettings)
    settings.platform = { ...settings.platform!, enabled: true, authenticated: true, advancedSettingsEnabled: true,
      baseUrl: 'https://example.com', expiresAt: new Date(Date.now() + 60000).toISOString(),
      capabilities: { asr: true, llm: true, } }
    const secrets = { platformAccessToken: 'test-token', asrApiKey: '', llmApiKey: '', }
    expect(routeService(settings, secrets, 'asr').settings.asr.url).toBe('wss://example.com/api/v1/asr')
    settings.platform.baseUrl = 'http://203.0.113.10:8080'
    expect(routeService(settings, secrets, 'asr').settings.asr.url).toBe('ws://203.0.113.10:8080/api/v1/asr')
  })
})
