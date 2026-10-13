import type { Settings, SettingsInput } from '../../../shared/types'
import { ToggleSwitch } from './ui/switch'

interface WebSearchPreferencesProps {
  catalog: Settings
  draft: SettingsInput
  onChange: (draft: SettingsInput) => void
}

export default function WebSearchPreferences({ catalog, draft, onChange }: WebSearchPreferencesProps) {
  if (!catalog.platform?.advancedSettingsEnabled) return null
  const available = catalog.platform.webSearchAvailable === true
  return <ToggleSwitch label="开启联网搜索" checked={draft.webSearch?.enabled ?? false} disabled={!available}
    description={available ? '回答前与资料检索并行搜索网页；检索失败仍继续回答。' : '平台尚未开放联网搜索，请联系管理员配置 Tavily。'}
    onCheckedChange={enabled => onChange({ ...draft, webSearch: { enabled } })} />
}
