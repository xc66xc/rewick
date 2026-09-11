import type { HTMLAttributes, Ref } from 'react'
import { cn } from '../../lib/cn'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  ref?: Ref<HTMLSpanElement>
}

/**
 * 计数徽标(§6 tab 计数风格化):mono 10.5px、subtle 底 + 边、圆角 chip。
 * 数字/状态短标签通用;纯展示,语义由调用方给 aria。
 */
export function Badge({ className, children, ref, ...props }: BadgeProps) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-chip border border-border bg-subtle px-1.5 font-mono text-[10.5px] leading-[18px] font-medium text-text-secondary',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
