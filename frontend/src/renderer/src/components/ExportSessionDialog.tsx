import { useState } from 'react'
import type { SessionExportOptions } from '../../../shared/types'
import { Modal } from './ui/dialog'
import { Button } from './ui/button'
import { CheckRow } from './ui/check-row'

interface ExportSessionDialogProps {
  onClose: () => void
  onExport: (options: SessionExportOptions) => void
}

export default function ExportSessionDialog({ onClose, onExport }: ExportSessionDialogProps) {
  const [options, setOptions] = useState<SessionExportOptions>({ includeAiAnswers: true, includeTranscript: true, includeInterviewInfo: true })
  return <Modal open title="导出会话记录" onOpenChange={open => { if (!open) onClose() }}
    footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={() => onExport(options)}>确认导出</Button></>}>
    <p className="mb-5 text-sm text-text-secondary">选择要导出的内容，问题始终保留。文件格式为 Markdown（.md）。</p>
    <div className="flex flex-wrap justify-center gap-6 py-4">
      <CheckRow label="AI回答" checked={options.includeAiAnswers} onChange={checked => setOptions(value => ({ ...value, includeAiAnswers: checked }))} />
      <CheckRow label="转写" checked={options.includeTranscript} onChange={checked => setOptions(value => ({ ...value, includeTranscript: checked }))} />
      <CheckRow label="面试信息" checked={options.includeInterviewInfo} onChange={checked => setOptions(value => ({ ...value, includeInterviewInfo: checked }))} />
    </div>
  </Modal>
}
