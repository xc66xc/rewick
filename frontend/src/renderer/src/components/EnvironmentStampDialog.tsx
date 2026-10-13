import { environmentStampColors } from '../../../shared/environment-stamp'
import useEnvironmentStampEditor from '../hooks/useEnvironmentStampEditor'
import EnvironmentStamp from './EnvironmentStamp'
import { Modal } from './ui/dialog'
import { Button, IconButton } from './ui/button'
import { TextField } from './ui/field'
import { cn } from '../lib/cn'

interface EnvironmentStampDialogProps { editor: ReturnType<typeof useEnvironmentStampEditor> }
const colorLabels = { blue: '蓝色', amber: '橙色', green: '绿色', red: '红色' }
export default function EnvironmentStampDialog({ editor }: EnvironmentStampDialogProps) {
  const { target, text, color, busy, validation } = editor
  const previewStamp = text.trim() && !validation ? { text: text.trim(), color } : null
  return <Modal open={Boolean(target)} onOpenChange={open => { if (!open) editor.close() }} title="个性化印章" footer={<>
    {target?.stamp && <Button variant="quiet" className="mr-auto text-danger" disabled={busy} onClick={() => void editor.save(true)}>清除印章</Button>}
    <Button disabled={busy} onClick={editor.close}>取消</Button>
    <Button variant="primary" loading={busy} disabled={busy || !text.trim() || Boolean(validation)} onClick={() => void editor.save()}>保存印章</Button>
  </>}>
    <div className="flex flex-col gap-6">
      <div className="environment-stamp-preview" aria-label="印章实时预览"><EnvironmentStamp preview stamp={previewStamp} disabled /></div>
      <TextField label="印章文字" value={text} error={validation} hint={`${Array.from(text.trim()).length}/8 个字符，空格也计入长度`} disabled={busy} autoComplete="off" onChange={event => editor.setText(event.target.value)} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium text-text-secondary">常用文案</legend>
        <div className="flex flex-wrap items-center gap-2">
          {editor.shortcuts.values.map(value => <div key={value} className="flex items-center rounded-chip border border-border-strong bg-card">
            <Button variant="quiet" size="sm" disabled={busy} onClick={() => editor.setText(value)}>{value}</Button>
            <IconButton className="size-8 hover:text-danger" aria-label={`删除常用文案 ${value}`} title={`删除常用文案 ${value}`} disabled={busy || !editor.shortcuts.removable} onClick={() => editor.shortcuts.remove(value)}><X aria-hidden="true" /></IconButton>
          </div>)}
          {!editor.shortcuts.values.length && <span className="text-xs text-text-muted">没有常用文案，仍可直接输入。</span>}
          {editor.shortcuts.changed && <Button variant="quiet" size="sm" disabled={busy} onClick={editor.shortcuts.restore}>恢复默认</Button>}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2"><legend className="mb-2 text-xs font-medium text-text-secondary">印章颜色</legend><div className="flex flex-wrap gap-2">{environmentStampColors.map(value => <Button key={value} size="sm" aria-pressed={color === value} disabled={busy} className={cn(`environment-stamp-color--${value}`, color === value && 'border-current')} onClick={() => editor.setColor(value)}><span className="environment-stamp-swatch" aria-hidden="true" />{colorLabels[value]}</Button>)}</div></fieldset>
    </div>
  </Modal>
}
import { X } from '@phosphor-icons/react'
