import { ArrowsInSimple, ArrowsOutSimple, GearSix, PushPin, Waveform } from '@phosphor-icons/react'
import { IconButton } from './ui/button'
import { cn } from '../lib/cn'

/* v30 骨架 §2(2026-09-12 修订):品牌(icon+名称)从侧栏移入顶栏,面包屑移除,顶栏高 50px;右侧 pin + 设置 + 紧凑。
   账号与退出登录在侧栏 profile / 设置弹窗;设置入口统一为顶栏齿轮(常规与紧凑同构)。
   macOS hiddenInset 红绿灯(关闭/最小化/缩放)悬浮左上,常规品牌块让位:x:18 起三钮右缘 ≈70px,
   pl 90px → 与标题恒距 20px(2026-09-14 用户确认)。
   Windows 无边框窗口:系统缩小/放大/关闭按钮(Window Controls Overlay)悬浮右上,右侧动作区用
   env(titlebar-area-width) 让位(2026-09-14);mac 未启用 overlay,env 回退值即原 pr-8 / pr-2,两端间距不变。紧凑窗口独立无边框，不为原生窗口按钮留空。 */
const isMacOS = navigator.userAgent.includes('Macintosh')
const macInsetClass = 'pl-[90px] max-[560px]:pl-[90px]'
interface TopbarProps { compact: boolean; pinned: boolean; onCompact: () => void; onPin: () => void; onSettings: () => void; desktop: boolean; loggingOut?: boolean }
export default function Topbar({ compact, pinned, onCompact, onPin, onSettings, desktop, loggingOut = false }: TopbarProps) {
  return <header className={cn('flex h-[50px] shrink-0 items-center justify-between bg-page select-none [-webkit-app-region:drag]',
    compact ? 'gap-0 pr-2' : 'gap-3 pr-[calc(100vw_-_env(titlebar-area-width,100vw)_+_2rem)]')}>
    {compact
      ? <span className="pl-4 text-xs font-semibold text-text-heading">Interview Copilot</span>
      : <div className={cn('flex items-center gap-2.5 pl-4', isMacOS && macInsetClass)} aria-label="Interview Copilot">
        <span className="grid size-6 shrink-0 place-items-center rounded-control bg-[linear-gradient(356deg,var(--color-accent)_0%,var(--color-violet)_103.24%)] text-text-on-fill"><Waveform size={16} aria-hidden="true" /></span>
        <strong className="text-[14px] font-semibold tracking-[-0.01em] text-text-primary">Interview Copilot</strong>
      </div>}
    <div className="flex items-center gap-2.5">
      <IconButton aria-label={pinned ? '取消置顶' : '窗口置顶'} title={pinned ? '取消置顶' : '窗口置顶'} aria-pressed={pinned} className={pinned ? 'bg-accent-subtle text-accent-text hover:bg-accent-subtle hover:text-accent-text' : undefined} onClick={onPin} disabled={!desktop || loggingOut}><PushPin size={17} /></IconButton>
      <IconButton aria-label="打开设置" title="打开设置" onClick={onSettings} disabled={loggingOut}><GearSix size={18} /></IconButton>
      <IconButton aria-label={compact ? '恢复完整窗口' : '紧凑模式'} title={compact ? '恢复完整窗口' : '紧凑模式'} onClick={onCompact} disabled={loggingOut}>{compact ? <ArrowsOutSimple size={17} /> : <ArrowsInSimple size={17} />}</IconButton>
    </div>
  </header>
}
