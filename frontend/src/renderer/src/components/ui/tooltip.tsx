import type { ReactElement, ReactNode } from 'react'
import { Tooltip as BaseTooltip } from '@base-ui/react'
import { cn } from '../../lib/cn'

export interface TooltipProps {
  /** 提示内容 */
  content: ReactNode
  /** 触发元素:须为单个元素,经 render 合并(不额外包 button,保留原语义/样式) */
  children: ReactElement
  /** 相对触发元素的方位,默认 top */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** 对齐方式,默认 center */
  align?: 'start' | 'center' | 'end'
  className?: string
}

/**
 * 悬停/聚焦提示(2026-09-11 基建外推,设计稿未画):深底白字、radius-chip,
 * 悬停 600ms / 键盘聚焦即出,Esc/移开/失焦关闭(Base UI Tooltip)。
 * 设计稿原有交互全靠原生 title(延迟 1s、不可样式化),主应用重构以此替换。
 */
export function Tooltip({ content, children, side = 'top', align = 'center', className }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} align={align} sideOffset={6} className="z-[90]">
          <BaseTooltip.Popup
            className={cn(
              'rounded-chip bg-overlay px-2.5 py-1.5 text-[11px] leading-relaxed text-text-on-fill shadow-pop',
              className,
            )}
          >
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  )
}
