// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import useLibraryDraft, { clearLibraryDrafts } from '../src/renderer/src/hooks/useLibraryDraft'
const empty = { name: '', text: '', version: 0, id: '', bodyLoaded: true }
const records = [{ ...empty, id: 'one', name: '简历一', bodyLoaded: false }, { ...empty, id: 'two', name: '简历二', bodyLoaded: false }]
beforeEach(() => clearLibraryDrafts())
afterEach(() => cleanup())
it('loads selected resume bodies and ignores a late response from a previous selection', async () => {
  const callbacks = new Map<string, (value: typeof empty) => void>()
  const load = vi.fn((id: string) => new Promise<typeof empty>(resolve => callbacks.set(id, resolve)))
  const { result } = renderHook(() => useLibraryDraft(records, empty, true, 'one', 'test', load))
  await waitFor(() => expect(load).toHaveBeenCalledWith('one'))
  act(() => result.current.replace(records[1]))
  await act(async () => callbacks.get('two')?.({ ...records[1], text: '第二份正文', version: 3, bodyLoaded: true }))
  expect(result.current.draft.text).toBe('第二份正文')
  await act(async () => callbacks.get('one')?.({ ...records[0], text: '迟到的第一份', version: 1, bodyLoaded: true }))
  expect(result.current.draft.id).toBe('two')
  expect(result.current.draft.version).toBe(3)
})
it('keeps unsaved text and its original version when the library refreshes', async () => {
  const original = { ...empty, id: 'one', text: '原正文', version: 1 }
  const { result, rerender } = renderHook(({ rows }) => useLibraryDraft(rows, empty, true, 'one', 'test'), { initialProps: { rows: [original] } })
  act(() => result.current.setDraft({ ...original, text: '我的未保存修改' }))
  rerender({ rows: [{ ...original, text: '另一台设备修改', version: 2 }] })
  expect(result.current.draft.text).toBe('我的未保存修改')
  expect(result.current.draft.version).toBe(1)
  expect(result.current.dirty).toBe(true)
})
