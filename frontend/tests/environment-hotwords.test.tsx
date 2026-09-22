// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EnvironmentHotwords from '../src/renderer/src/components/EnvironmentHotwords'
import { environmentHotwordsError } from '../src/shared/environment-hotwords'
import type { EnvironmentInput } from '../src/shared/types'

const initial: EnvironmentInput = { interviewType: 'technical', name: '面试', resumeId: 'resume', targetId: null, referenceIds: [], hotwords: ['Agent'] }
afterEach(cleanup)
function setup(extract: (input: EnvironmentInput) => Promise<string[]> = vi.fn(async () => ['Agent', '虚拟量测'])) {
  const changed = vi.fn()
  function Editor() {
    const [draft, setDraft] = useState(initial)
    return <EnvironmentHotwords draft={draft} disabled={false} onExtract={extract} onChange={value => {
      changed(value)
      setDraft(value)
    }} />
  }
  return { ...render(<Editor />), actor: userEvent.setup(), extract, changed }
}
describe('environment hotwords', () => {
  it('edits terms manually and merges extracted terms without duplicates', async () => {
    const { actor, extract, changed } = setup()
    const input = screen.getByRole('textbox', { name: '专业术语（选填）' })
    await actor.type(input, '\nRAG，Agent')
    await actor.click(screen.getByRole('button', { name: '从所选资料提取' }))
    await screen.findByText('已合并提取结果，请检查后保存。')
    expect(extract).toHaveBeenCalledWith(expect.objectContaining({ hotwords: ['Agent', 'RAG'] }))
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ hotwords: ['Agent', 'RAG', '虚拟量测'] }))
    expect((input as HTMLTextAreaElement).value).toBe('Agent\nRAG\n虚拟量测')
    await actor.clear(input)
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ hotwords: [] }))
  })
  it('preserves edits made during extraction', async () => {
    let resolve: (value: string[]) => void = () => undefined
    const { actor, changed } = setup(() => new Promise<string[]>(done => { resolve = done }))
    await actor.click(screen.getByRole('button', { name: '从所选资料提取' }))
    await actor.type(screen.getByRole('textbox'), '\nReactor')
    resolve(['虚拟量测'])
    await screen.findByText('已合并提取结果，请检查后保存。')
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ hotwords: ['Agent', 'Reactor', '虚拟量测'] }))
  })
  it('discards results after changing sources', async () => {
    let resolve: (value: string[]) => void = () => undefined
    const extract = () => new Promise<string[]>(done => { resolve = done })
    const changed = vi.fn()
    const view = render(<EnvironmentHotwords draft={initial} disabled={false} onExtract={extract} onChange={changed} />)
    await userEvent.click(screen.getByRole('button', { name: '从所选资料提取' }))
    view.rerender(<EnvironmentHotwords draft={{ ...initial, resumeId: 'another' }} disabled={false} onExtract={extract} onChange={changed} />)
    resolve(['错误术语'])
    await waitFor(() => expect((screen.getByRole('button', { name: '从所选资料提取' }) as HTMLButtonElement).disabled).toBe(false))
    expect(changed).not.toHaveBeenCalled()
    expect(screen.getByText('资料选择已变化，可重新提取专业术语。')).toBeTruthy()
  })
  it('ignores closed editor results and shows extraction errors', async () => {
    let resolve: (value: string[]) => void = () => undefined
    const { actor, changed, unmount } = setup(() => new Promise<string[]>(done => { resolve = done }))
    await actor.click(screen.getByRole('button', { name: '从所选资料提取' }))
    unmount()
    resolve(['旧术语'])
    await Promise.resolve()
    expect(changed).not.toHaveBeenCalled()
    setup(async () => { throw new Error('提取服务暂时不可用') })
    await actor.click(screen.getByRole('button', { name: '从所选资料提取' }))
    expect((await screen.findByRole('alert')).textContent).toBe('提取服务暂时不可用')
  })
  it('keeps invalid input visible so users can shorten it', async () => {
    const { actor, changed } = setup()
    await actor.clear(screen.getByRole('textbox'))
    await actor.type(screen.getByRole('textbox'), 'a'.repeat(81))
    expect(screen.getByText('每个专业术语须为 1—80 个字符，且不能包含控制字符。')).toBeTruthy()
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ hotwords: ['a'.repeat(81)] }))
  })
  it('enforces term count, length, control character and payload limits', () => {
    expect(environmentHotwordsError(['Agent', '虚拟量测'])).toBe('')
    expect(environmentHotwordsError(['词'.repeat(80)])).toBe('')
    expect(environmentHotwordsError(['词'.repeat(81)])).not.toBe('')
    expect(environmentHotwordsError(['Agent\t'])).not.toBe('')
    expect(environmentHotwordsError(Array.from({ length: 201 }, (_, i) => `word${i}`))).not.toBe('')
    expect(environmentHotwordsError(Array.from({ length: 100 }, (_, i) => `${i}${'词'.repeat(60)}`))).toBe('专业术语总长度超出限制，请精简后保存。')
  })
})
