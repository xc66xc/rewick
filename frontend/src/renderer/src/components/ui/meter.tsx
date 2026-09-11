import type { Ref } from 'react'
import { cn } from '../../lib/cn'

const BAR_COUNT = 14

export interface LevelMeterProps {
  /** 0~1,越界自动钳制;14 格取整点亮 */
  level?: number
  className?: string
  'aria-label'?: string
  ref?: Ref<HTMLDivElement>
}

/**
 * .meter(spec §2 工作台胶囊栏):14 格 LED 电平条,2.5×10px,亮格 success / 灭格 led-idle。
 * level 取 0~1,由调用方按录音 RMS 驱动;展示组件自身不计时。
 */
export function LevelMeter({ level = 0, className, 'aria-label': ariaLabel = '输入音量', ref }: LevelMeterProps) {
  const clamped = Math.min(1, Math.max(0, level))
  const lit = Math.round(clamped * BAR_COUNT)
  return (
    <div
      ref={ref}
      role="meter"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('mr-0.5 inline-flex h-3 shrink-0 items-center gap-0.5', className)}
    >
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <i
          key={index}
          aria-hidden
          className={cn(
            'h-2.5 w-[2.5px] rounded-[1px] transition-colors duration-150 ease-standard',
            index < lit ? 'bg-success' : 'bg-led-idle',
          )}
        />
      ))}
    </div>
  )
}
