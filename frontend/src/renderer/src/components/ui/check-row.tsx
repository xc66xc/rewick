import type { ReactNode, Ref } from 'react'
import { cn } from '../../lib/cn'

export interface CheckRowProps {
  label: ReactNode
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  name?: string
  id?: string
  className?: string
  'aria-label'?: string
  /** 指向内部 input */
  ref?: Ref<HTMLInputElement>
}

/**
 * .check-row(spec §5 委托项/§6.1 ref-enable):原生 checkbox + accent-color(tokens 基线已设),
 * 12.5px 文字。设计即原生控件,不引入 Base UI 以保持观感一致。
 */
export function CheckRow({
  label,
  checked,
  defaultChecked,
  onChange,
  disabled,
  name,
  id,
  className,
  'aria-label': ariaLabel,
  ref,
}: CheckRowProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'my-0.5 flex cursor-pointer items-center gap-2 text-[12.5px] font-normal text-text-regular',
        disabled && 'cursor-not-allowed opacity-45',
        className,
      )}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        name={name}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange?.(event.currentTarget.checked)}
        className="m-0 size-[15px] shrink-0 p-0"
      />
      <span>{label}</span>
    </label>
  )
}

/**
 * .choice-row(spec §8.1 检索来源选择):原生 radio/checkbox 芯片,
 * :has(:checked) 时换蓝边浅蓝底。radio 分组由同名 name 天然成组,无需额外组件。
 */
export interface ChoiceRowProps {
  label: ReactNode
  description?: ReactNode
  value?: string
  name?: string
  type?: 'radio' | 'checkbox'
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
  /** 指向内部 input */
  ref?: Ref<HTMLInputElement>
}

export function ChoiceRow({
  label,
  description,
  value,
  name,
  type = 'radio',
  checked,
  defaultChecked,
  onChange,
  disabled,
  className,
  ref,
}: ChoiceRowProps) {
  return (
    <label
      className={cn(
        'mt-2 flex cursor-pointer items-center gap-2.5 rounded-chip border border-border bg-card px-3 py-2.5 text-[12.5px] font-normal text-text-regular transition-colors hover:border-border-strong',
        'has-[:checked]:border-accent-line has-[:checked]:bg-accent-subtle',
        disabled && 'cursor-not-allowed opacity-45',
        className,
      )}
    >
      <input
        ref={ref}
        type={type}
        value={value}
        name={name}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.currentTarget.checked)}
        className="m-0 size-[15px] shrink-0 border-0 bg-transparent p-0 shadow-none focus-visible:shadow-focus-ring"
      />
      <span>{label}</span>
      {description !== undefined && <span className="text-[11.5px] text-text-muted">{description}</span>}
    </label>
  )
}
