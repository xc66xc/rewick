/**
 * 弹窗遮罩信号(2026-09-20):ui/dialog 的 Modal 挂载计数 +1、卸载 -1,App 订阅后转发主进程。
 * Windows 无边框窗的原生标题条(WCO 缩小/放大/关闭)绘制在网页层之上,弹窗遮罩盖不到它,
 * 主进程把标题条着色成遮罩同色以消除断层;mac 红绿灯为系统按钮无法着色,订阅侧按平台跳过。
 * 同一同步块内的计数翻转(React StrictMode 开发期对 effect 做 挂载→清理→再挂载 的三连推,
 * 会让原生标题条 灰→白→灰 闪变)合并为一次通知:微任务 checkpoints 只发最终深度态。
 */
let depth = 0
let dimmed = false
let pendingValue = false
let pending = false
const listeners = new Set<(visible: boolean) => void>()

/** 弹窗打开(true)/关闭(false)计数;深度变化时排队微任务,合并同步突发后只通知最终态 */
export function pushWindowScrim(visible: boolean): void {
  depth = Math.max(0, depth + (visible ? 1 : -1))
  const next = depth > 0
  if (next === dimmed && !pending) return
  dimmed = next
  pendingValue = next
  if (pending) return
  pending = true
  queueMicrotask(() => {
    pending = false
    for (const listener of listeners) listener(pendingValue)
  })
}

export function onWindowScrim(listener: (visible: boolean) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
