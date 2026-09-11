import { useId, type ReactNode, type Ref } from 'react'
import { Switch } from '@base-ui/react'
import { cn } from '../../lib/cn'

/**
 * .switch(spec §2)双规格:
 * md 44×24 / knob 20 / 位移 20(设置等表单);sm 32×18 / knob 14 / 位移 14(工作台胶囊栏"自动回答")。
 * 组内状态由 data-checked 驱动(knob 用 group-data-[checked] 位移,不依赖 Thumb 自身属性)。
 */
const rootSizes = {
  md: 'h-6 w-11 p-0.5 [&_.icp-switch-thumb]:size-5 [&_.icp-switch-thumb]:group-data-[checked]:translate-x-5',
  sm: 'h-[18px] w-8 p-0.5 [&_.icp-switch-thumb]:size-3.5 [&_.icp-switch-thumb]:group-data-[checked]:translate-x-3.5',
} as const

export interface ToggleSwitchProps {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  size?: keyof typeof rootSizes
  /** 开关旁的说明文字 */
  label?: ReactNode
  /** label 下的副文案(设置项的两行说明);仅在传 label 时生效 */
  description?: ReactNode
  className?: string
  id?: string
  'aria-label'?: string
  /** 指向开关本体(span[role=switch],Base UI Switch 根元素为 span + 隐藏 input) */
  ref?: Ref<HTMLSpanElement>
}

export function ToggleSwitch({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  size = 'md',
  label,
  description,
  className,
  id,
  ref,
  ...aria
}: ToggleSwitchProps) {
  const autoId = useId()
  const inputId = id ?? `icp-switch-${autoId}`
  const control = (
    <Switch.Root
      ref={ref}
      id={inputId}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={onCheckedChange ? (nextChecked: boolean) => onCheckedChange(nextChecked) : undefined}
      disabled={disabled}
      className={cn(
        'group inline-flex shrink-0 items-center rounded-full bg-track-idle transition-colors data-[checked]:bg-accent data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45',
        rootSizes[size],
        !label && className,
      )}
    >
      <Switch.Thumb className="icp-switch-thumb block rounded-full bg-card transition-transform duration-150 ease-standard" />
    </Switch.Root>
  )
  if (!label) return control
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer gap-2.5 text-[12.5px] font-medium text-text-primary',
        description ? 'items-start' : 'items-center',
        className,
      )}
    >
      {control}
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        {description !== undefined && (
          <span className="text-[11px] leading-relaxed font-normal text-text-muted">{description}</span>
        )}
      </span>
    </label>
  )
}
