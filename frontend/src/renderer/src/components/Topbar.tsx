import { ArrowsInSimple, ArrowsOutSimple, GearSix, PushPin } from '@phosphor-icons/react'
import type { Page } from './Sidebar'
import { IconButton } from './ui/button'
import { cn } from '../lib/cn'

/* v30 骨架 §2:白底无边框顶栏,左侧面包屑,右侧 pin + 紧凑;
   账号与退出登录移至侧栏 profile / 设置弹窗。紧凑模式无侧栏,顶栏保留齿轮兜底。 */
const pageTitles: Record<Page, string> = { preparation: '准备面试', workspace: '面试工作台', context: '个人背景', history: '会话记录' }
interface TopbarProps { page: Page; compact: boolean; pinned: boolean; onCompact: () => void; onPin: () => void; onSettings: () => void; desktop: boolean; loggingOut?: boolean }
export default function Topbar({ page, compact, pinned, onCompact, onPin, onSettings, desktop, loggingOut = false }: TopbarProps) {
  return <header className={cn('flex shrink-0 items-center justify-between bg-page select-none [-webkit-app-region:drag]', compact ? 'h-14 gap-0 pr-2' : 'h-[76px] gap-3 pr-8')}>
    {compact
      ? <span className="pl-4 text-xs font-semibold text-text-heading">Interview Copilot</span>
      : <div className="flex items-center gap-2.5 pl-8 text-[12.5px] text-text-secondary max-[560px]:pl-4"><span>我的空间</span><span aria-hidden="true" className="text-border-strong">/</span><span aria-current="page" className="font-medium text-text-primary">{pageTitles[page]}</span></div>}
    <div className="flex items-center gap-2.5">
      <IconButton aria-label={pinned ? '取消置顶' : '窗口置顶'} title={pinned ? '取消置顶' : '窗口置顶'} aria-pressed={pinned} className={pinned ? 'bg-accent-subtle text-accent-text hover:bg-accent-subtle hover:text-accent-text' : undefined} onClick={onPin} disabled={!desktop || loggingOut}><PushPin size={17} /></IconButton>
      {compact && <IconButton aria-label="打开设置" title="打开设置" onClick={onSettings} disabled={loggingOut}><GearSix size={18} /></IconButton>}
      <IconButton aria-label={compact ? '恢复完整窗口' : '紧凑模式'} title={compact ? '恢复完整窗口' : '紧凑模式'} onClick={onCompact} disabled={loggingOut}>{compact ? <ArrowsOutSimple size={17} /> : <ArrowsInSimple size={17} />}</IconButton>
    </div>
  </header>
}
