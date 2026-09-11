import { ClockCounterClockwise, FileText, Gear, Plus, SquaresFour, Waveform } from '@phosphor-icons/react'
import { version } from '../../../../package.json'
import { IconButton } from './ui/button'
import { cn } from '../lib/cn'

export type Page = 'preparation' | 'workspace' | 'context' | 'history'
interface SidebarProps { page: Page; onChange: (page: Page) => void; account?: string; onSettings: () => void }
const navigation = [
  { page: 'preparation' as const, label: '准备面试', icon: Plus },
  { page: 'workspace' as const, label: '工作台', icon: SquaresFour },
  { page: 'context' as const, label: '个人背景', icon: FileText },
  { page: 'history' as const, label: '会话记录', icon: ClockCounterClockwise }
]
/* v30 骨架 §2:白底文字侧栏(206px),≤950px 收窄为 76px 图标栏(品牌文字/标签/菜单文字/脚注隐藏)。 */
export default function Sidebar({ page, onChange, account, onSettings }: SidebarProps) {
  return <aside className="flex w-[206px] shrink-0 flex-col bg-page px-3.5 pt-6 pb-4 max-[950px]:w-[76px] max-[950px]:px-2 max-[560px]:w-[64px]">
    <div className="mb-8 flex items-center gap-2.5 px-2.5 max-[950px]:mb-6 max-[950px]:justify-center max-[950px]:px-0" aria-label="Interview Copilot">
      <span className="grid size-[33px] shrink-0 place-items-center rounded-control bg-[linear-gradient(356deg,var(--color-accent)_0%,var(--color-violet)_103.24%)] text-text-on-fill"><Waveform size={22} aria-hidden="true" /></span>
      <span className="min-w-0 max-[950px]:hidden">
        <strong className="block text-[15px] leading-[1.25] font-semibold tracking-[-0.01em] text-text-primary">Interview<br />Copilot</strong>
        <small className="block text-[9.5px] tracking-[0.14em] whitespace-nowrap text-text-muted">YOUR QUIET EDGE</small>
      </span>
    </div>
    <div className="px-3 pb-2.5 text-xs font-semibold tracking-[0.08em] text-text-muted max-[950px]:hidden">WORKSPACE</div>
    <nav className="flex w-full flex-col gap-1" aria-label="主导航">
      {navigation.map(item => <button key={item.page} onClick={() => onChange(item.page)} aria-current={page === item.page ? 'page' : undefined}
        className={cn('flex h-9 w-full items-center gap-[11px] rounded-control px-2.5 text-left text-[13px] font-medium text-text-regular transition-colors hover:bg-border hover:text-text-primary max-[950px]:justify-center max-[950px]:px-0',
          page === item.page && 'bg-border font-semibold text-text-primary hover:bg-border hover:text-text-primary')}>
        <item.icon size={18} aria-hidden="true" className="shrink-0" /><span className="max-[950px]:hidden">{item.label}</span>
      </button>)}
    </nav>
    <div className="mt-auto">
      <p className="px-3 pt-4 pb-1 text-[10.5px] leading-[1.9] text-text-secondary max-[950px]:hidden">专注对话，让思路自然发生。<span className="mt-1.5 block font-mono text-[9px] tracking-[0.1em] text-text-muted">INTERVIEW COPILOT / {version}</span></p>
      <div className="flex items-center gap-2.5 px-2 pt-3 max-[950px]:flex-col max-[950px]:justify-center max-[950px]:px-0">
        {account && <span className="grid size-[31px] shrink-0 place-items-center rounded-full bg-accent-subtle text-[10.5px] font-semibold text-accent" aria-hidden="true">{account.slice(0, 2).toUpperCase()}</span>}
        {account && <strong className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary max-[950px]:hidden">{account}</strong>}
        <IconButton aria-label="打开设置" title="模型与设置" onClick={onSettings} className="ml-auto max-[950px]:ml-0"><Gear size={16} /></IconButton>
      </div>
    </div>
  </aside>
}
