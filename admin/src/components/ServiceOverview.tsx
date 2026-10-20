import { thinkingModeNames, thinkingProtocolNames } from '../thinking'
import { Cube, Database, Globe, Microphone, PencilSimple, PlugsConnected } from '@phosphor-icons/react'
import { capabilityNames, searchDepthNames } from '../types'
import type { ServiceForm } from '../hooks/unified-service'
import styles from '../styles.module.css'
import layout from '../pages/ConfigPage.module.css'
interface Props { value: ServiceForm; busy: boolean; onEdit: () => void; onSave: (value: ServiceForm, test?: boolean) => Promise<boolean>; onRemove: () => void }
export default function ServiceOverview({ value, busy, onEdit, onSave, onRemove }: Props) {
  const Icon = { llm: Cube, asr: Microphone, embedding: Database, 'web-search': Globe }[value.kind]
  let address = value.url
  let host = '未配置'
  try { const url = new URL(value.url); host = url.hostname; address = `${url.origin}${url.pathname}` } catch { address = '未配置有效接口地址' }
  return <article className={layout.card} aria-label={`服务 ${value.name}`}>
    <header className={layout.cardHeader}><span className={layout.icon}><Icon size={26} /></span><div className={layout.identity}><h3>{value.name}</h3><span className={styles.tableDetail}>{capabilityNames[value.kind]}</span></div><span className={value.enabled ? styles.enabledBadge : styles.mutedBadge}>{value.enabled ? '已启用' : '已停用'}</span></header>
    <dl className={layout.facts}>{value.kind !== 'web-search' && <div className={layout.full}><dt>模型名称</dt><dd>{value.model || '未配置'}</dd></div>}<div><dt>API 接口地址</dt><dd>{address}</dd></div><div><dt>域名 / 服务商</dt><dd>{host}</dd></div><div><dt>API Key</dt><dd>{value.hasApiKey ? '已配置' : '未配置'}</dd></div>{value.kind === 'web-search' && <><div><dt>保留网页数量（topK）</dt><dd>{value.topK} 条</dd></div><div><dt>搜索深度</dt><dd>{searchDepthNames[value.searchDepth]}</dd></div><div><dt>超时</dt><dd>{value.timeoutMs} ms</dd></div><div><dt>包含摘要答案</dt><dd>{value.includeAnswer === 'advanced' ? '高级摘要' : value.includeAnswer === 'basic' ? '基础摘要' : '不包含'}</dd></div></>}{value.kind === 'llm' && <div><dt>最大输出</dt><dd>{value.maxOutputTokens.toLocaleString()} Tokens</dd></div>}{value.kind === 'llm' && <div><dt>思考模式</dt><dd>{thinkingModeNames[value.thinkingMode ?? 'default']}{value.thinkingMode && value.thinkingMode !== 'default' ? ` · ${thinkingProtocolNames[value.thinkingProtocol ?? 'none']}` : ''}</dd></div>}{value.kind === 'embedding' && <div><dt>向量维度</dt><dd>{value.dimensions} 维</dd></div>}</dl>
    {value.kind === 'web-search' && <p className={styles.hint}>{value.enabled ? '当前平台使用此联网搜索服务；仅高级设置授权用户可在桌面开启。' : '未启用。若当前使用其他联网搜索服务，上述参数仅在启用此项时应用。'}</p>}
    <footer className={layout.cardActions}><button type="button" className={styles.linkButton} disabled={busy} onClick={onEdit}><PencilSimple size={17} />编辑配置</button><button type="button" className={styles.linkButton} disabled={busy || !value.enabled} onClick={() => void onSave(value, true)}><PlugsConnected size={17} />测试连接</button><button type="button" className={styles.linkButton} disabled={busy} onClick={() => void onSave({ ...value, enabled: !value.enabled })}>{value.enabled ? '停用' : '启用'}</button><button type="button" className={styles.linkDanger} disabled={busy} onClick={onRemove}>删除</button></footer>
  </article>
}
