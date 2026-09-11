import type { Ref } from 'react'
import { cn } from '../../lib/cn'

export interface SkeletonProps {
  className?: string
  ref?: Ref<HTMLDivElement>
}

/**
 * 骨架占位(2026-09-11 基建外推):border 色灰块 + 1.6s 呼吸(复用 Dot 脉冲令牌)。
 * 尺寸形状由 className 决定(h-4 w-full / size-9 圆形 + rounded-full)。
 */
export function Skeleton({ className, ref }: SkeletonProps) {
  return <div aria-hidden ref={ref} className={cn('animate-pulse-dot rounded-control bg-border', className)} />
}
