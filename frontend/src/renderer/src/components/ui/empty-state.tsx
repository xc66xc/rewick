import type { ReactNode, Ref } from 'react'
import { cn } from '../../lib/cn'

export interface EmptyStateProps {
  /** 瓷片图标(22px,如 Waveform / Sparkle) */
  icon: ReactNode
  title: ReactNode
  /** 支持换行说明文字 */
  description?: ReactNode
  /** accent = 蓝瓷片(转写侧等默认);success = 绿瓷片(回答侧,spec §4.5) */
  tone?: 'accent' | 'success'
  /** 尾部附加区(如 empty-ctx 的“回答将参考”胶囊组) */
  children?: ReactNode
  className?: string
  ref?: Ref<HTMLDivElement>
}

/**
 * 空态块(spec §4.5 双面板空态):44px 圆角瓷片 + 标题(14.5/600)+ 说明(12,lh 1.8),
 * 纵排居中;调用方放入滚动容器后以 margin:auto 垂直居中(容器切 flex)。
 */
export function EmptyState({ icon, title, description, tone = 'accent', children, className, ref }: EmptyStateProps) {
  return (
    <div ref={ref} className={cn('flex flex-col items-center px-7 py-9 text-center', className)}>
      <span
        aria-hidden
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-control [&_svg]:size-[22px]',
          tone === 'accent' ? 'bg-accent-subtle text-accent-text' : 'bg-success-subtle text-success',
        )}
      >
        {icon}
      </span>
      <h3 className="mt-3 text-[14.5px] font-semibold text-text-heading">{title}</h3>
      {description !== undefined && (
        <p className="mt-1.5 max-w-[420px] text-[12px] leading-[1.8] text-text-secondary">{description}</p>
      )}
      {children !== undefined && <div className="mt-4">{children}</div>}
    </div>
  )
}
