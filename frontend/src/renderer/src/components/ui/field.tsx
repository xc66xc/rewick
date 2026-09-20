import type { InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from 'react'
import { Field } from '@base-ui/react'
import { cn } from '../../lib/cn'

/**
 * .field(spec §2):纵排 label(12.5/500)+ 控件(1px border-strong,radius-chip,`11px 12px`,13/400,
 * focus = accent 边 + 3px 光环)。Base UI Field 提供联动/校验骨架。
 * error(2026-09-11 基建增补):红边 + aria-invalid + Field.Error 文案,显示时取代 hint。
 */
export const controlClass =
  'w-full rounded-chip border border-border-strong bg-card px-3 py-[11px] text-[13px] font-normal text-text-primary outline-none transition-[border-color,box-shadow] placeholder:text-text-muted focus:border-accent focus:shadow-focus-ring disabled:cursor-not-allowed disabled:opacity-45'

const errorControlClass = 'border-danger focus:border-danger focus:shadow-none'

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'prefix'> {
  label?: ReactNode
  /** .field-hint:控件下方的固定说明 */
  hint?: ReactNode
  /** 校验错误:控件红边 + aria-invalid,文案显示时取代 hint */
  error?: ReactNode
  /** 控件内前置图标(搜索框放大镜等,§7);传入后控件自动让出左内边距 */
  prefix?: ReactNode
  /** 控件内后置图标/快捷键;传入后控件自动让出右内边距 */
  suffix?: ReactNode
  /** required 星标开关(默认随 required 显示;登录页关闭,保持 label 文本纯净供 getByLabelText 精确匹配) */
  requiredMark?: boolean
  className?: string
  ref?: Ref<HTMLInputElement>
}

export function TextField({
  label,
  hint,
  error,
  prefix,
  suffix,
  requiredMark = true,
  className,
  id,
  ref,
  ...props
}: TextFieldProps) {
  const invalid = error != null
  const control = (
    <Field.Control
      ref={ref}
      id={id}
      aria-invalid={invalid || undefined}
      {...props}
      className={cn(controlClass, invalid && errorControlClass, prefix && 'pl-9', suffix && 'pr-9')}
    />
  )
  return (
    <Field.Root className={cn('flex flex-col gap-2', className)} data-disabled={props.disabled}>
      {label !== undefined && (
        <Field.Label htmlFor={id} className="text-[12.5px] font-medium text-text-regular">
          {label}
          {props.required && requiredMark && (
            <span aria-hidden className="ml-0.5 text-danger">
              *
            </span>
          )}
        </Field.Label>
      )}
      {prefix || suffix ? (
        <div className="relative">
          {prefix && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-muted [&_svg]:size-3.5"
            >
              {prefix}
            </span>
          )}
          {control}
          {suffix && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-text-muted [&_svg]:size-3.5"
            >
              {suffix}
            </span>
          )}
        </div>
      ) : (
        control
      )}
      {invalid ? (
        <Field.Error match className="text-[11px] leading-relaxed text-danger">
          {error}
        </Field.Error>
      ) : (
        hint !== undefined && (
          <Field.Description className="text-[11px] leading-relaxed text-text-secondary">{hint}</Field.Description>
        )
      )}
    </Field.Root>
  )
}

export interface TextareaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  label?: ReactNode
  hint?: ReactNode
  /** 校验错误:控件红边 + aria-invalid,文案显示时取代 hint */
  error?: ReactNode
  className?: string
  /** 覆盖控件本身样式(编辑器等页面级规格) */
  controlClassName?: string
  ref?: Ref<HTMLTextAreaElement>
}

export function TextareaField({
  label,
  hint,
  error,
  className,
  controlClassName,
  id,
  ref,
  ...props
}: TextareaFieldProps) {
  const invalid = error != null
  return (
    <Field.Root className={cn('flex flex-col gap-2', className)} data-disabled={props.disabled}>
      {label !== undefined && (
        <Field.Label htmlFor={id} className="text-[12.5px] font-medium text-text-regular">
          {label}
          {props.required && (
            <span aria-hidden className="ml-0.5 text-danger">
              *
            </span>
          )}
        </Field.Label>
      )}
      <Field.Control
        render={<textarea id={id} ref={ref} spellCheck={false} aria-invalid={invalid || undefined} {...props} />}
        className={cn(controlClass, 'resize-y leading-[23px]', invalid && errorControlClass, controlClassName)}
      />
      {invalid ? (
        <Field.Error match className="text-[11px] leading-relaxed text-danger">
          {error}
        </Field.Error>
      ) : (
        hint !== undefined && (
          <Field.Description className="text-[11px] leading-relaxed text-text-secondary">{hint}</Field.Description>
        )
      )}
    </Field.Root>
  )
}

/** .field-row:双列并排 */
export function FieldRow({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('grid grid-cols-2 gap-3.5', className)}>{children}</div>
}
