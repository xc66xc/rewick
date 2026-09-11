import type { ReactNode, Ref } from 'react'
import { Collapsible } from '@base-ui/react'
import { cn } from '../../lib/cn'

export interface CollapseProps {
  summary: ReactNode
  children: ReactNode
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  ref?: Ref<HTMLDivElement>
}

/**
 * 折叠卡片(details/summary 替代,spec §11 答案区“本次检索资料/本次发送内容”):
 * 边线圆角卡容器,折叠头常驻卡内(图标 mr-2 垂直居中),面板 mt-3 + pre-wrap;
 * 与页面其余部分的间距(如 mt-5)由调用方经 className 控制。
 */
export function Collapse({ summary, children, open, defaultOpen, onOpenChange, className, ref }: CollapseProps) {
  return (
    <Collapsible.Root
      ref={ref}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={(nextOpen) => onOpenChange?.(nextOpen)}
      className={cn('rounded-chip border border-border p-3 text-xs', className)}
    >
      <Collapsible.Trigger className="w-full cursor-pointer text-left text-text-secondary transition-colors hover:text-text-primary [&_svg]:mr-2 [&_svg]:inline-block [&_svg]:align-middle">
        {summary}
      </Collapsible.Trigger>
      <Collapsible.Panel className="mt-3 whitespace-pre-wrap">{children}</Collapsible.Panel>
    </Collapsible.Root>
  )
}
