/* 弹窗遮罩信号(2026-09-20):Modal 挂载计数,微任务合并同步突发(StrictMode 三连推只发一次最终态)。 */
import { describe, expect, it, vi } from 'vitest'
import { onWindowScrim, pushWindowScrim } from '../../src/renderer/src/lib/window-scrim'

/** 排空微任务队列,让合并后的通知落地 */
const flush = () => new Promise<void>(resolve => queueMicrotask(() => resolve()))

describe('window scrim 信号', () => {
  it('深度变化才通知,嵌套弹窗(如确认弹窗叠在设置弹窗上)不重复触发', async () => {
    const listener = vi.fn()
    const off = onWindowScrim(listener)
    pushWindowScrim(true)
    pushWindowScrim(true) // 嵌套第二层
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith(true)
    pushWindowScrim(false)
    await flush()
    expect(listener).toHaveBeenCalledTimes(1) // 仍在弹窗内
    pushWindowScrim(false)
    await flush()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith(false)
    pushWindowScrim(false) // 过量 close 不下穿
    await flush()
    expect(listener).toHaveBeenCalledTimes(2)
    off()
    pushWindowScrim(true)
    await flush()
    expect(listener).toHaveBeenCalledTimes(2) // 退订后不再接收
    pushWindowScrim(false)
    await flush()
  })

  it('同一同步块内的 true→false→true(StrictMode 开发期双调用 effect)合并为一次通知', async () => {
    const listener = vi.fn()
    const off = onWindowScrim(listener)
    pushWindowScrim(true)
    pushWindowScrim(false)
    pushWindowScrim(true)
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith(true)
    pushWindowScrim(false)
    await flush()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith(false)
    off()
  })
})
