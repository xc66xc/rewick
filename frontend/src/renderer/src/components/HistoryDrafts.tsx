import { useEffect, useRef, useState } from 'react'
import type { DesktopBridge } from '../../../shared/types'
import { Button } from './ui/button'
import { Modal } from './ui/dialog'
import { toast } from './ui/toast'

type Draft = Awaited<ReturnType<NonNullable<DesktopBridge['getHistoryDrafts']>>>[number]
const reasons = { record_changed: '服务器记录已变更', record_deleted: '服务器记录已删除', retry_limit: '多次同步失败，已暂停自动重试' }
export default function HistoryDrafts({ bridge, onRecovered }: { bridge: DesktopBridge; onRecovered: () => void }) {
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  async function refresh() { setDrafts(await bridge.getHistoryDrafts!()) }
  useEffect(() => { void refresh().catch(() => undefined) }, [bridge])
  async function act(action: () => Promise<unknown>) {
    if (running.current) return
    running.current = true; setBusy(true)
    try { await action(); await refresh() }
    catch (error) { toast.show(error instanceof Error ? error.message : '草稿处理失败，本地内容仍保留。', { type: 'error' }) }
    finally { running.current = false; setBusy(false) }
  }
  return <>
    <Button onClick={() => { setOpen(true); void act(refresh) }}>处理本地草稿{drafts.length ? `（${drafts.length}）` : ''}</Button>
    <Modal open={open} onOpenChange={setOpen} title="待处理的本地草稿">
      <p className="mb-5 text-sm text-text-secondary">草稿仍保留在本机。另存会创建新的会话记录，服务器上的原记录保持原样；只有新记录确认保存成功后，才会清理对应的旧草稿。</p>
      {!drafts.length && <p role="status" className="text-sm text-text-secondary">没有需要处理的草稿。</p>}
      <ul className="space-y-4">{drafts.map(draft => <li key={draft.id} className="rounded-card border border-border p-4">
        <h3 className="mb-1 break-words text-sm font-semibold">{draft.title}</h3>
        <p className="mb-3 text-xs text-text-secondary">{reasons[draft.reason]}</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void act(async () => {
            const record = await bridge.getHistoryDraft!(draft.id)
            await bridge.exportSession(record, { includeAiAnswers: true, includeTranscript: true, includeInterviewInfo: true })
          })}>导出本地草稿</Button>
          <Button disabled={busy} onClick={() => void act(async () => {
            await bridge.recoverHistoryDraft!(draft.id)
            toast.show('已另存为新会话记录。', { type: 'success' }); onRecovered()
          })}>另存为新会话记录</Button>
          {draft.reason === 'retry_limit' && <Button disabled={busy} onClick={() => void act(async () => { await bridge.retryHistoryDraft!(draft.id); onRecovered() })}>重试同步</Button>}
        </div>
      </li>)}</ul>
      {busy && <p role="status" className="mt-4 text-xs text-text-secondary">正在处理，请稍候…</p>}
    </Modal>
  </>
}
