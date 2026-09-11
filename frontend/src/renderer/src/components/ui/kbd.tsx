import type { ReactNode, Ref } from 'react'
import { cn } from '../../lib/cn'

export interface KbdProps {
  children: ReactNode
  className?: string
  ref?: Ref<HTMLElement>
}

/** kbd(spec §4.4 composer「⌘ ↵」):mono 10px、60% 不透明度;设计即素字,不加边框 */
export function Kbd({ children, className, ref }: KbdProps) {
  return (
    <kbd ref={ref} className={cn('font-mono text-[10px] leading-none font-normal opacity-60', className)}>
      {children}
    </kbd>
  )
}
