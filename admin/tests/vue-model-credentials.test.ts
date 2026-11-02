import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import UnifiedServiceCard from '../src/components/services-rewick/UnifiedServiceCard.vue'
import { allowsBlankServiceKey, applyService, serviceForms, type ServiceForm } from '../src/hooks/unified-service'
import { config } from './fixtures'

describe('Vue model configuration credential boundaries', () => {
  it('clears an unsaved key when a cached service page is inactive and requires a replacement after address change', async () => {
    const onSave = vi.fn(async (_value: ServiceForm, _test?: boolean) => true), view = render(UnifiedServiceCard, { props: { value: serviceForms(config)[0], busy: false, saved: true, active: true, onSave } }), actor = userEvent.setup()
    await actor.click(screen.getByRole('button', { name: '编辑配置' }))
    await actor.type(screen.getByLabelText('API Key'), 'synthetic-secret'); await view.rerender({ active: false }); expect(screen.getByLabelText('API Key')).toHaveProperty('value', '')
    await view.rerender({ active: true }); const address = screen.getByLabelText('接口地址'); await actor.clear(address); await actor.type(address, 'https://replacement.example.invalid/chat/completions')
    expect(screen.getByLabelText('API Key')).toHaveProperty('required', true)
    await actor.click(screen.getByRole('button', { name: '保存' })); expect(onSave).not.toHaveBeenCalled()
  })
  it('does not publish a test and clears the key only after a successful save', async () => {
    const onSave = vi.fn(async (_value: ServiceForm, _test?: boolean) => true)
    render(UnifiedServiceCard, { props: { value: serviceForms(config)[0], busy: false, saved: true, active: true, onSave } }); const actor = userEvent.setup()
    await actor.click(screen.getByRole('button', { name: '编辑配置' })); await actor.type(screen.getByLabelText('API Key'), 'synthetic-secret')
    await actor.click(screen.getByRole('button', { name: '测试连接' })); await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1)); expect(onSave.mock.calls[0][1]).toBe(true); expect(screen.getByLabelText('API Key')).toHaveProperty('value', 'synthetic-secret')
    await actor.click(screen.getByRole('button', { name: '保存' })); await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2)); expect(onSave.mock.calls[1][1]).toBe(false); expect(screen.getByLabelText('API Key')).toHaveProperty('value', '')
  })
  it('retains shared-provider siblings and chooses the remaining enabled default without changing contracts', () => {
    const shared = { ...config, models: [...config.models, { ...config.models[0], id: 'second' }] }, item = serviceForms(shared)[0]
    const disabled = applyService(shared, { ...item, enabled: false })
    expect(disabled.models.find(row => row.id === 'second')?.enabled).toBe(true); expect(disabled.defaultModelId).toBe('second')
    expect(() => applyService(shared, { ...item, url: 'https://other.example.invalid/chat/completions' })).toThrow('重新填写')
  })
  it('allows blank credentials only for embedding on exact HTTP loopback hosts', () => {
    for (const url of ['http://localhost:8000/embeddings', 'https://127.0.0.1/embeddings', 'http://[::1]:8000/embeddings']) { expect(allowsBlankServiceKey({ kind: 'embedding', url })).toBe(true); expect(allowsBlankServiceKey({ kind: 'llm', url })).toBe(false) }
    for (const url of ['https://localhost.example/embeddings', 'http://127.0.0.2/embeddings', 'http://localhost@remote.example/embeddings', 'wss://localhost/embeddings']) expect(allowsBlankServiceKey({ kind: 'embedding', url })).toBe(false)
  })
})
