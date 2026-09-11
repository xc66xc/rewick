import type { HTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from '../../lib/cn'

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  ref?: Ref<HTMLSpanElement>
}

/** .pill:信息胶囊(10.5/500,subtle 底 + 1px 边,radius 4) */
export function Pill({ className, children, ref, ...props }: PillProps) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex shrink-0 items-center gap-[5px] rounded border border-border bg-subtle px-[9px] text-[10.5px] leading-[22px] font-medium text-text-regular [&_svg]:size-3 [&_svg]:shrink-0 [&_svg]:text-text-muted',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export type DotTone = 'success' | 'accent' | 'danger' | 'muted'

/** .dot:6px 状态点;pulse 时 1.6s 呼吸(最新问题/ready/busy 状态章) */
export function Dot({
  tone = 'success',
  pulse = true,
  className,
  ref,
}: {
  tone?: DotTone
  pulse?: boolean
  className?: string
  ref?: Ref<HTMLSpanElement>
}) {
  return (
    <span
      ref={ref}
      className={cn(
        'size-1.5 shrink-0 rounded-full',
        tone === 'success' && 'bg-success',
        tone === 'accent' && 'bg-accent',
        tone === 'danger' && 'bg-danger',
        tone === 'muted' && 'bg-text-muted',
        pulse && 'animate-pulse-dot',
        className,
      )}
    />
  )
}

/** 参考资料状态章(spec §6.1 四态):pending 灰 / busy 蓝 / ready 绿 / error 红 */
const statusStyles = {
  pending: { pill: 'border-border bg-subtle text-text-regular', tone: 'muted' as DotTone, pulse: false },
  busy: { pill: 'border-accent-line bg-accent-subtle text-accent-text', tone: 'accent' as DotTone, pulse: true },
  ready: { pill: 'border-success-line bg-success-subtle text-success', tone: 'success' as DotTone, pulse: true },
  error: { pill: 'border-danger-line bg-danger-subtle text-danger', tone: 'danger' as DotTone, pulse: false },
} as const

export type RefDocStatus = keyof typeof statusStyles

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  status: RefDocStatus
  ref?: Ref<HTMLSpanElement>
}

export function StatusPill({ status, children, className, ref, ...props }: StatusPillProps) {
  const s = statusStyles[status]
  return (
    <span
      ref={ref}
      role="status"
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-[4px] border px-[9px] text-[11px] leading-[24px] font-medium',
        s.pill,
        className,
      )}
      {...props}
    >
      <Dot tone={s.tone} pulse={s.pulse} />
      {children}
    </span>
  )
}

/** .eyebrow:mono 小标签(10/700,ls .16em,accent-text,uppercase) */
export function Eyebrow({
  className,
  children,
  ref,
}: {
  className?: string
  children: ReactNode
  ref?: Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={ref}
      className={cn('mb-2.5 font-mono text-[10px] font-bold tracking-[0.16em] text-accent-text uppercase', className)}
    >
      {children}
    </div>
  )
}
