import type { RecordingResourceStatus } from '../../../shared/recording-types'
import { Button } from './ui/button'
import { Modal } from './ui/dialog'

interface Props {
  status: RecordingResourceStatus | null
  onCancel: () => void
  onConfirm: () => void
}
export function resourceSize(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`
}
export default function RecordingResourceConsent({ status, onCancel, onConfirm }: Props) {
  return <Modal open={status !== null} onOpenChange={open => { if (!open) onCancel() }} title="下载本地语音资源" footer={<>
    <Button onClick={onCancel}>取消</Button>
    <Button variant="primary" onClick={onConfirm}>下载并继续</Button>
  </>}>
    <p className="text-sm leading-relaxed text-text-secondary">首次生成面试复盘需要下载语音识别环境和模型。下载完成后会保留在本机，之后无需重复下载。</p>
    {status && <dl className="my-5 grid grid-cols-2 gap-3 rounded-chip border border-border bg-subtle p-4 text-sm">
      <dt className="text-text-secondary">本次下载</dt><dd className="text-right font-medium">{resourceSize(status.downloadBytes)}</dd>
      <dt className="text-text-secondary">所需可用空间</dt><dd className="text-right font-medium">至少 {resourceSize(status.requiredBytes)}</dd>
    </dl>}
    <p className="text-xs leading-relaxed text-text-secondary">资源从 GitHub 下载，网络较慢时可能需要等待。取消不会影响已保存的录音；选择导出位置后才会开始下载。</p>
  </Modal>
}
