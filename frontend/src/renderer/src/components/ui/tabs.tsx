import type { ReactNode, Ref } from 'react'
import { Tabs } from '@base-ui/react'
import { cn } from '../../lib/cn'

export interface TabItem {
  value: string
  label: string
  /** 页签尾计数(§6 资料库「我的简历 02」,muted 数字;由调用方格式化,如 02 / 99+) */
  count?: ReactNode
  /** 透传到页签按钮的 id;调用方渲染的自定义面板用 aria-labelledby 指回来 */
  id?: string
}

export interface TabBarProps {
  items: TabItem[]
  /** 受控当前页签(面板内容调用方按 value 切换) */
  value: string
  onValueChange: (value: string) => void
  className?: string
  'aria-label'?: string
  /** 指向页签栏容器(div[role=tablist]) */
  ref?: Ref<HTMLDivElement>
}

/**
 * .library-tabs(spec §6):下划线式页签,激活 = text-primary + 600 字重 + 3px accent 下划线。
 * 仅渲染页签栏;面板内容由调用方按 value 自行切换(设计即如此,§11 renderLibrary)。
 */
export function TabBar({ items, value, onValueChange, className, 'aria-label': ariaLabel, ref }: TabBarProps) {
  return (
    <Tabs.Root
      value={value}
      onValueChange={(next) => onValueChange(String(next))}
      aria-label={ariaLabel}
      className={cn('mb-5', className)}
    >
      <Tabs.List ref={ref} className="flex items-center gap-6 border-b border-border-strong">
        {items.map((tab) => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
            id={tab.id}
            className="relative shrink-0 cursor-pointer px-0.5 pt-[9px] pb-[11px] text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary data-[active]:font-semibold data-[active]:text-text-primary data-[active]:after:absolute data-[active]:after:inset-x-0 data-[active]:after:-bottom-px data-[active]:after:h-[3px] data-[active]:after:rounded-t-[3px] data-[active]:after:bg-accent data-[active]:after:content-['']"
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 font-mono text-[10.5px] font-normal text-text-muted">{tab.count}</span>
            )}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs.Root>
  )
}
