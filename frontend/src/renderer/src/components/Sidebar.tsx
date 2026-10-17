import { Button } from './ui/button'
import { ChatsCircle, ClockCounterClockwise, FileText, Plus, SquaresFour, ShoppingBag } from '@phosphor-icons/react'
import { cn } from '../lib/cn'

export type Page = 'preparation' | 'workspace' | 'context' | 'history' | 'purchase' | 'mock'
interface SidebarProps { page: Page; onChange: (page: Page) => void; account?: string }
const navigation = [
  { page: 'preparation' as const, label: '准备面试', icon: Plus },
  { page: 'workspace' as const, label: '工作台', icon: SquaresFour },
  { page: 'mock' as const, label: '模拟面试', icon: ChatsCircle },
  { page: 'context' as const, label: '个人背景', icon: FileText },
  { page: 'purchase' as const, label: '购买时长', icon: ShoppingBag },
  { page: 'history' as const, label: '会话记录', icon: ClockCounterClockwise }
]
/* v30 骨架 §2:白底文字侧栏(206px),品牌已移入顶栏、设置入口收归顶栏齿轮(2026-09-12);≤950px 收窄为 76px 图标栏(标签/菜单文字/脚注隐藏)。 */
export default function Sidebar({ page, onChange, account }: SidebarProps) {
  return <aside className="flex w-[206px] shrink-0 flex-col bg-page px-3.5 pt-3.5 pb-4 max-[950px]:w-[76px] max-[950px]:px-2 max-[560px]:w-[64px]">
    <div className="px-3 pb-2.5 text-xs font-semibold tracking-[0.08em] text-text-muted max-[950px]:hidden">WORKSPACE</div>
    <nav className="flex w-full flex-col gap-1" aria-label="主导航">
      {navigation.map(item => <Button variant="quiet" key={item.page} aria-label={item.label} onClick={() => onChange(item.page)} aria-current={page === item.page ? 'page' : undefined}
        className={cn('justify-start border-0 py-0 flex h-9 w-full items-center gap-[11px] rounded-control px-2.5 text-left text-[13px] font-medium text-text-regular transition-colors hover:bg-border hover:text-text-primary max-[950px]:justify-center max-[950px]:px-0',
          page === item.page && 'bg-border font-semibold text-text-primary hover:bg-border hover:text-text-primary')}>
        <item.icon size={18} aria-hidden="true" className="shrink-0" /><span className="max-[950px]:hidden">{item.label}</span>
      </Button>)}
    </nav>
    <div className="mt-auto">
      <p className="px-3 pt-4 pb-1 text-[10.5px] leading-[1.9] text-text-secondary max-[950px]:hidden">专注对话，让思路自然发生。<span className="mt-1.5 block font-mono text-[9px] tracking-[0.1em] text-text-muted">掌灯 Rewick · v{version}</span></p>
      <div className="flex items-center gap-2.5 px-2 pt-3 max-[950px]:flex-col max-[950px]:justify-center max-[950px]:px-0">
        {account && <span className="grid size-[31px] shrink-0 place-items-center rounded-full bg-accent-subtle text-[10.5px] font-semibold text-accent" aria-hidden="true">{account.slice(0, 2).toUpperCase()}</span>}
        {account && <strong className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary max-[950px]:hidden">{account}</strong>}
      </div>
    </div>
  </aside>
}
import { version } from '../../../../package.json'
