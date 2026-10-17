import { useState } from 'react'
import type { MockBridge } from '../../../../shared/mock-interview'
import { Button } from '../../components/ui/button'
import { toast } from '../../components/ui/toast'

interface Props { bridge: MockBridge; id: string }
export default function MockQaExport({ bridge, id }: Props) {
  const [exporting, setExporting] = useState(false)
  async function exportQa() {
    setExporting(true)
    try {
      if (await bridge.exportQa(id)) toast.show('问答 Markdown 已导出。')
    } catch (reason) {
      toast.show(reason instanceof Error ? reason.message : '问答导出失败，请重试。', { type: 'error' })
    } finally { setExporting(false) }
  }
  return <section className="space-y-4 rounded-card border border-border bg-card p-6">
    <h2 className="text-lg font-semibold">面试问答</h2>
    <p className="text-sm text-text-secondary">导出本场问题和你的回答原文，未回答及已跳过的问题会单独标明。</p>
    <Button disabled={exporting} onClick={() => void exportQa()}>{exporting ? '正在导出…' : '导出 Q&A Markdown'}</Button>
  </section>
}
