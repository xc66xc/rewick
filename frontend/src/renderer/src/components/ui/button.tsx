import type { ButtonHTMLAttributes, Ref } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { CircleNotch } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'

/**
 * .btn 家族(spec §2):default / primary / quiet × md(36) / sm(32,composer) / xs(30,行内小按钮)。
 * 行内小按钮(转写操作/资料行操作)在原设计里自带 1px 描边,这里归为 variant 'outline' + size 'xs'。
 * 全员透传 ref(React 19 ref-prop 写法),供聚焦控制/表单库/测试使用。
 */
export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-chip font-medium [&_svg]:size-[15px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border border-border-strong bg-card text-text-regular hover:bg-subtle',
        primary: 'border border-accent bg-accent text-text-on-fill hover:bg-accent-hover active:bg-accent-active',
        quiet: 'border border-transparent bg-transparent text-text-secondary hover:bg-subtle',
        outline:
          'border border-border bg-card text-text-secondary hover:border-accent-line hover:bg-accent-subtle hover:text-accent-text',
      },
      size: {
        md: 'min-h-9 px-3.5 py-2 text-xs',
        sm: 'min-h-8 px-3 text-[11.5px]',
        xs: 'min-h-[30px] px-2.5 text-[11px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** 进行中:行首转圈图标 + 自动禁用 + aria-busy(生成回答/重建索引等异步动作) */
  loading?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  className,
  variant,
  size,
  type = 'button',
  loading = false,
  disabled,
  ref,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading && <CircleNotch aria-hidden className="animate-spin" />}
      {children}
    </button>
  )
}

/** 行内小按钮的危险态(移除等):hover 红字红边浅红底,配 variant='outline' 使用 */
export const buttonDangerClass = 'hover:border-danger-line hover:bg-danger-subtle hover:text-danger'

/** .icon-btn:36×36 方形图标按钮 */
export const iconButtonClass =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-chip text-text-secondary transition-colors hover:bg-subtle hover:text-text-primary active:bg-subtle [&_svg]:size-4'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>
}

export function IconButton({ className, type = 'button', ref, ...props }: IconButtonProps) {
  return <button ref={ref} type={type} className={cn(iconButtonClass, className)} {...props} />
}

export interface LinkButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>
}

/** .link-btn:文字链接按钮(accent 文字,hover 浅蓝底) */
export function LinkButton({ className, type = 'button', ref, ...props }: LinkButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center gap-2 rounded-chip px-2 py-1.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent-subtle [&_svg]:size-3.5',
        className,
      )}
      {...props}
    />
  )
}

export interface TextButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>
}

/** .text-btn:危险文字按钮(删除等) */
export function TextButton({ className, type = 'button', ref, ...props }: TextButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'rounded-chip px-2 py-1.5 text-xs text-text-secondary transition-colors hover:text-danger',
        className,
      )}
      {...props}
    />
  )
}
