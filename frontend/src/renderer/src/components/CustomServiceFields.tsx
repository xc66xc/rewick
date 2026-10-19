import type { CustomServiceInput, CustomServiceProfile } from '../../../shared/types'
import { Badge } from './ui/badge'
import { fieldClass, formNoteClass } from '../lib/form'

interface CustomServiceFieldsProps { draft: CustomServiceInput; saved?: CustomServiceProfile; onChange: (value: CustomServiceInput) => void }
export default function CustomServiceFields({ draft, saved, onChange }: CustomServiceFieldsProps) {
  const changedAddress = Boolean(saved && draft.url.trim() !== saved.url)
  return <>
    <label className={fieldClass}>配置名称<input required maxLength={100} value={draft.name} onChange={event => onChange({ ...draft, name: event.target.value })} placeholder="例如：我的 DeepSeek" /></label>
    <label className={fieldClass}>{draft.kind === 'asr' ? 'WebSocket 地址' : 'API 地址'}<input type="url" required value={draft.url} onChange={event => onChange({ ...draft, url: event.target.value })} /></label>
    <p className="-mt-2 mb-4 text-xs leading-[1.8] text-text-muted">{draft.kind === 'asr' ? '使用兼容 Fun-ASR 协议的 ws:// 或 wss:// 地址。' : '兼容 OpenAI 接口，可填写基础地址或完整接口地址。本地模型支持 localhost。'}</p>
    <label className={fieldClass}>模型名称<input required value={draft.model ?? ''} onChange={event => onChange({ ...draft, model: event.target.value })} /></label>
    <label className={fieldClass}><span>API Key{saved?.hasApiKey && <Badge className="ml-2 border-transparent bg-success-subtle font-sans text-[10px] text-success">已保存</Badge>}</span><input type="password" autoComplete="new-password" value={draft.apiKey ?? ''}
      placeholder={saved?.hasApiKey && !changedAddress ? '留空保留已保存的 Key' : '填写此服务的 API Key；本地模型可留空'}
      onChange={event => onChange({ ...draft, apiKey: event.target.value || undefined })} /></label>
    {changedAddress && saved?.hasApiKey && <p className={formNoteClass}>连接地址已改变，请重新填写 API Key，原密钥不会发送到新地址。</p>}
  </>
}
