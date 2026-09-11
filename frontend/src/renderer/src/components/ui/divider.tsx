import type { Ref } from 'react'
import { cn } from '../../lib/cn'

export interface DividerProps {
  className?: string
  ref?: Ref<HTMLHRElement>
}

/** 水平分隔线:1px border 色、语义化 <hr>;垂直场景在 flex 容器内用 className 覆写(w-px 自伸展) */
export function Divider({ className, ref }: DividerProps) {
  return <hr ref={ref} className={cn('border-0 border-t border-border', className)} />
}
