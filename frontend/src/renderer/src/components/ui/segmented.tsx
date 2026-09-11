import type { Ref } from 'react'
import { Toggle, ToggleGroup } from '@base-ui/react'
import { cn } from '../../lib/cn'

export interface SegmentedOption {
  value: string
  label: string
  icon?: React.ReactNode
}

export interface SegmentedProps {
  /** 受控值(本组件为受控专用,调用方持有状态) */
  value: string
  onValueChange: (value: string) => void
  options: SegmentedOption[]
  /** 整组禁用(如转写进行中锁定音源) */
  disabled?: boolean
  className?: string
  'aria-label'?: string
  /** 指向分段容器 div */
  ref?: Ref<HTMLDivElement>
}

/**
 * .segmented(spec §2):分段单选(音源切换等)。
 * Base UI ToggleGroup + Toggle;选中态由 data-pressed 驱动(白底 + 1px 浅蓝边 + accent 文字)。
 */
export function Segmented({
  value,
  onValueChange,
  options,
  disabled,
  className,
  'aria-label': ariaLabel,
  ref,
}: SegmentedProps) {
  return (
    <ToggleGroup
      ref={ref}
      value={[value]}
      onValueChange={(next) => {
        const picked = next.at(-1)
        if (picked !== undefined) onValueChange(picked)
      }}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-chip border border-border bg-subtle p-0.5',
        disabled && 'opacity-45',
        className,
      )}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          value={option.value}
          className="inline-flex items-center gap-1.5 rounded-[4px] border border-transparent px-2 py-[3px] text-[10.5px] font-medium text-text-secondary transition-colors hover:text-text-primary [&_svg]:size-[13px] data-[pressed]:border-accent-line data-[pressed]:bg-card data-[pressed]:font-semibold data-[pressed]:text-accent-text data-[pressed]:hover:border-accent"
        >
          {option.icon}
          {option.label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}
