// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { defaultSettings } from '../src/shared/defaults'
import type { DesktopBridge, RetrievalContext, SettingsInput } from '../src/shared/types'
import { settingsInput } from '../src/renderer/src/hooks/useSettings'
import WebSearchPreferences from '../src/renderer/src/components/WebSearchPreferences'
import ReferenceSources from '../src/renderer/src/components/ReferenceSources'
import AnswerCard from '../src/renderer/src/components/AnswerCard'

afterEach(() => { cleanup(); vi.unstubAllEnvs(); Reflect.deleteProperty(window, 'copilot') })
const web: RetrievalContext = { status: 'ready', web: { status: 'ready' }, excerpts: [{ source: 'web', documentId: 'web:one', chunkId: 'web:chunk', revision: 1, name: '官网', title: '官方说明', url: 'https://example.com/guide', text: '网页片段', kind: 'technical' }] }

describe('web search settings and sources', () => {
  it('labels generated summaries separately and provides no invented source link', async () => {
    render(<ReferenceSources retrieval={{ status: 'ready', web: { status: 'ready' }, excerpts: [{ source: 'web', generatedSummary: true, documentId: 'web:summary', chunkId: 's1', revision: 1, name: 'Tavily 生成摘要（非网页原文）', text: '供应商生成摘要正文', kind: 'technical' }] }} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /本次检索资料/ }))
    expect(screen.getByText('生成摘要 · 非网页原文')).toBeTruthy()
    expect(screen.getByText('供应商生成摘要正文')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /打开网页来源/ })).toBeNull()
    expect(screen.queryByText('网页片段')).toBeNull()
  })
  it('hides the setting for ordinary accounts', () => {
    render(<WebSearchPreferences catalog={defaultSettings} draft={settingsInput(defaultSettings)} onChange={vi.fn()} />)
    expect(screen.queryByRole('switch', { name: '开启联网搜索' })).toBeNull()
  })

  it('defaults off and edits only the account switch for an authorized account', async () => {
    const catalog = structuredClone(defaultSettings)
    if (!catalog.platform) throw new Error('Missing platform fixture')
    catalog.platform.advancedSettingsEnabled = true
    catalog.platform.webSearchAvailable = true
    const onChange = vi.fn<(value: SettingsInput) => void>()
    render(<WebSearchPreferences catalog={catalog} draft={settingsInput(catalog)} onChange={onChange} />)
    const toggle = screen.getByRole('switch', { name: /^开启联网搜索/ })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await userEvent.setup().click(toggle)
    expect(onChange.mock.calls[0][0].webSearch).toEqual({ enabled: true })
  })

  it('disables the toggle when the backend is not configured', () => {
    const catalog = structuredClone(defaultSettings)
    if (!catalog.platform) throw new Error('Missing platform fixture')
    catalog.platform.advancedSettingsEnabled = true
    catalog.platform.webSearchAvailable = false
    render(<WebSearchPreferences catalog={catalog} draft={settingsInput(catalog)} onChange={vi.fn()} />)
    expect(screen.getByRole('switch', { name: /^开启联网搜索/ }).hasAttribute('data-disabled')).toBe(true)
    expect(screen.getByText(/平台尚未开放联网搜索/)).toBeTruthy()
  })

  it('opens validated source URLs through the desktop bridge', async () => {
    const openWebSource = vi.fn(async () => undefined)
    window.copilot = { openWebSource } as unknown as DesktopBridge
    render(<ReferenceSources retrieval={web} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /本次检索资料/ }))
    expect(screen.getByText('联网搜索 · 技术参考')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '打开网页来源：官方说明' }))
    expect(openWebSource).toHaveBeenCalledExactlyOnceWith('https://example.com/guide')
  })

  it('does not offer unsafe legacy source links', async () => {
    render(<ReferenceSources retrieval={{ ...web, excerpts: [{ ...web.excerpts[0], url: 'javascript:alert(1)' }] }} />)
    await userEvent.setup().click(screen.getByRole('button', { name: /本次检索资料/ }))
    expect(screen.queryByRole('button', { name: /打开网页来源/ })).toBeNull()
  })

  it.each([false, true])('shows search failure without hiding the answer in production (compact=%s)', compact => {
    vi.stubEnv('DEV', false)
    render(<AnswerCard index={1} compact={compact} answer={{ id: 'one', question: '问题', text: '可用的口语回答', createdAt: '2026-10-13T02:00:00Z', status: 'complete', retrieval: {
      status: 'degraded', excerpts: [], web: { status: 'degraded', message: '联网搜索超时' }, message: '联网搜索超时',
    } }} />)
    expect(screen.getByText('联网搜索失败，本次继续回答')).toBeTruthy()
    expect(screen.getByText('可用的口语回答')).toBeTruthy()
    expect(screen.queryByText('本次发送内容')).toBeNull()
  })
})
