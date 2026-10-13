import { Books, FileText } from '@phosphor-icons/react'
import type { ReferenceExcerpt, RetrievalContext } from '../../../shared/types'
import { cn } from '../lib/cn'
import { formNoteClass } from '../lib/form'
import { Collapse } from './ui/collapsible'
import { LinkButton } from './ui/button'
import { StatusPill } from './ui/pill'
import { toast } from './ui/toast'
import { webSourceUrlSchema } from '../../../shared/web-search'

interface ReferenceSourcesProps { retrieval: RetrievalContext }
function excerptLocation(excerpt: ReferenceExcerpt): string {
  if (excerpt.pageStart === undefined) return '文字片段'
  return excerpt.pageEnd !== undefined && excerpt.pageEnd !== excerpt.pageStart ? `第 ${excerpt.pageStart}–${excerpt.pageEnd} 页` : `第 ${excerpt.pageStart} 页`
}
const degradedClass = 'rounded-chip bg-accent-subtle px-3 py-2 text-accent-text'
const degradedBadgeClass = 'ml-2 rounded-chip bg-accent-subtle px-2 text-[10px] text-accent-text'
export default function ReferenceSources({ retrieval }: ReferenceSourcesProps) {
  const remote = retrieval.remote
  const web = retrieval.web
  if (retrieval.status === 'disabled' && !remote && !web) return null
  const degraded = retrieval.status === 'degraded' || remote?.status === 'degraded' || web?.status === 'degraded'
  const remoteStatus = remote?.status === 'ready' ? '已检索' : remote?.status === 'empty' ? '未找到相关内容' : '检索暂不可用'
  const webStatus = web?.status === 'ready' ? '已检索' : web?.status === 'empty' ? '未找到相关内容' : '检索暂不可用'
  const webNotice = web && <StatusPill status={web.status === 'ready' ? 'ready' : web.status === 'degraded' ? 'error' : 'pending'} title={web.message}>
    {web.status === 'degraded' ? '联网搜索失败，本次继续回答' : `联网搜索：${webStatus}`}</StatusPill>
  async function openSource(url: string) {
    try {
      const safe = webSourceUrlSchema.parse(url)
      if (!window.copilot?.openWebSource) throw new Error('请在桌面应用中打开网页来源。')
      await window.copilot.openWebSource(safe)
    } catch { toast.show('无法打开网页来源，请检查网址或稍后重试。', { type: 'error' }) }
  }
  const remoteNote = remote && <p className={cn(formNoteClass, remote.status === 'degraded' && degradedClass)}>百炼远程知识库 · {remoteStatus}<br />Agent ID：{remote.agentId}{remote.message && <><br />{remote.message}</>}</p>
  if (!retrieval.excerpts.length) return <div>{webNotice}<p className={cn('mt-4 flex items-start gap-2 text-xs leading-[1.8] text-text-secondary [&_svg]:mt-[3px] [&_svg]:shrink-0', degraded && degradedClass)}><Books size={14} aria-hidden="true" />{retrieval.message || (degraded ? '资料检索暂不可用，本次未提供参考片段。' : '本次未找到相关资料。')}</p>{remoteNote}</div>
  return <div className="mt-5">{webNotice}<Collapse summary={<><Books size={15} aria-hidden="true" /><span>本次检索资料</span><span className="ml-2 text-text-muted">{retrieval.excerpts.length} 个片段</span>{remote && <span className="ml-2 text-text-muted">百炼：{remoteStatus}</span>}{web && <span className="ml-2 text-text-muted">联网：{webStatus}</span>}{degraded && <span className={degradedBadgeClass}>{remote || web ? '部分检索降级' : '关键词匹配'}</span>}</>}>
    <p className="my-3 leading-[1.8] text-text-secondary">以下片段提供给了本次回答模型，不代表逐句引用或事实核验。复制回答时不会包含这些资料。</p>
    {remoteNote}
    {retrieval.message && <p className="mt-4 flex items-start gap-2 leading-[1.8] [&_svg]:mt-[3px] [&_svg]:shrink-0">{retrieval.message}</p>}
    {degraded && !retrieval.message && <p className="mt-4">{remote || web ? '部分资料检索暂不可用，本次回答使用已取得的内容。' : '语义检索暂不可用，本次使用平台关键词匹配。'}</p>}
    <ol className="m-0 flex list-none flex-col gap-3 p-0">{retrieval.excerpts.map(excerpt => <li key={`${excerpt.source ?? 'local'}:${excerpt.documentId}:${excerpt.revision}:${excerpt.chunkId}`} className="rounded-chip border border-border bg-subtle p-3">
      <header className="mb-2 flex flex-wrap items-center gap-2"><FileText size={15} aria-hidden="true" className="shrink-0" /><strong className="text-xs font-medium [overflow-wrap:anywhere]">{excerpt.title || excerpt.name}</strong><span className="text-[10px] text-text-muted">{excerpt.source === 'web' ? '网页片段' : excerptLocation(excerpt)}{!['bailian', 'web'].includes(excerpt.source ?? '') && ` · 版本 ${excerpt.revision}`}</span></header>
      <span className="text-[10px] text-success">{excerpt.source === 'web' ? '联网搜索 · 技术参考' : excerpt.source === 'bailian' ? '百炼远程知识库 · 技术参考' : excerpt.kind === 'personal' ? '我的项目经历' : '技术参考'}</span>
      {excerpt.source === 'web' && excerpt.url && webSourceUrlSchema.safeParse(excerpt.url).success && <LinkButton className="block max-w-full break-all text-left" onClick={() => void openSource(excerpt.url ?? '')} aria-label={`打开网页来源：${excerpt.title || excerpt.name}`}>{excerpt.url}</LinkButton>}
      <p className="mt-2 mb-0 leading-[1.85] whitespace-pre-wrap text-text-secondary [overflow-wrap:anywhere]">{excerpt.text}</p>
    </li>)}</ol>
  </Collapse></div>
}
