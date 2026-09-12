import type { Ref } from 'react'
import { CaretDown, Plus } from '@phosphor-icons/react'
import { Select } from '@base-ui/react'
import { cn } from '../../lib/cn'

export interface SelectOption {
  value: string
  label: string
  /** 提供则按该值分组渲染(Select.Group + GroupLabel) */
  group?: string
  /** 不可选占位项(如“平台暂未提供”) */
  disabled?: boolean
}

export interface AppSelectProps {
  /** null = 未选择,触发器显示占位符(服务选择空态) */
  value?: string | null
  defaultValue?: string
  onValueChange?: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  /** 尾部“+ 自定义…”新增入口(模型/服务/知识库选择,spec §5/§8.1) */
  newItem?: { value: string; label: string }
  disabled?: boolean
  /** 三档规格:lg=页面级主选择器(14px);md=表单规格(13px,spec §5);sm=行内规格(11.5px,参考资料行 ref-kind,spec §6.1) */
  size?: 'lg' | 'md' | 'sm'
  id?: string
  className?: string
  'aria-label'?: string
  /** 校验失败(如引用已失效):红边 + aria-invalid */
  'aria-invalid'?: boolean
  /** 指向 Trigger 按钮(如服务选择下方的说明/告警段落) */
  'aria-describedby'?: string
  /** 指向 Trigger 按钮 */
  ref?: Ref<HTMLButtonElement>
}

const itemClass =
  'flex cursor-pointer items-center rounded-[4px] px-2.5 py-[7px] text-text-regular transition-colors data-[highlighted]:bg-subtle data-[highlighted]:text-text-primary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45'

/** 触发器与选项字号随档位缩放:lg 14/13.5,md 13/12.5,sm 11.5/11.5(px) */
const sizeClasses = {
  lg: { trigger: 'px-3.5 py-3 text-sm', item: 'text-[13.5px]' },
  md: { trigger: 'px-3 py-[11px] text-[13px]', item: 'text-[12.5px]' },
  sm: { trigger: 'px-2 py-[5px] text-[11.5px]', item: 'text-[11.5px]' },
} as const

/**
 * 设置面选择器(spec §5 模型/服务、§8.1 知识库):Trigger 沿用输入框外观,
 * 分组下拉 + 可选“自定义”入口;选中态不带勾选符(贴合原生 select 观感)。
 */
export function AppSelect({
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder = '请选择',
  newItem,
  disabled,
  size = 'md',
  id,
  className,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
  ref,
}: AppSelectProps) {
  const byValue = new Map(options.map((option) => [option.value, option.label]))
  if (newItem) byValue.set(newItem.value, newItem.label)

  const ungrouped = options.filter((option) => !option.group)
  const groups = [...new Set(options.map((option) => option.group).filter((g) => g !== undefined))]
  const itemsClass = cn(itemClass, sizeClasses[size].item)

  return (
    <Select.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(next ?? '')}
    >
      <Select.Trigger
        ref={ref}
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedby}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-chip border border-border-strong bg-card text-left text-text-primary outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-focus-ring disabled:cursor-not-allowed disabled:opacity-45',
          ariaInvalid && 'border-danger focus:border-danger focus:shadow-none',
          sizeClasses[size].trigger,
          className,
        )}
      >
        <Select.Value placeholder={placeholder}>
          {(v: string | null) => (v == null ? placeholder : (byValue.get(v) ?? v))}
        </Select.Value>
        <CaretDown className="size-4 shrink-0 text-text-muted" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={4} className="z-[80]">
          <Select.Popup className="max-h-72 min-w-(--anchor-width) overflow-auto rounded-control border border-border bg-card py-1 shadow-pop">
            {ungrouped.map((option) => (
              <Select.Item key={option.value} value={option.value} disabled={option.disabled} className={itemsClass}>
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
            {groups.map((group) => (
              <Select.Group key={group} className="flex flex-col">
                <Select.GroupLabel className="px-2.5 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-wide text-text-muted">
                  {group}
                </Select.GroupLabel>
                {options
                  .filter((option) => option.group === group)
                  .map((option) => (
                    <Select.Item key={option.value} value={option.value} disabled={option.disabled} className={itemsClass}>
                      <Select.ItemText>{option.label}</Select.ItemText>
                    </Select.Item>
                  ))}
              </Select.Group>
            ))}
            {newItem && (
              <>
                <Select.Separator className="mx-1.5 my-1 h-px bg-border" />
                <Select.Item
                  value={newItem.value}
                  className={cn(itemsClass, 'gap-1.5 font-medium text-accent-text data-[highlighted]:bg-accent-subtle')}
                >
                  <Plus className="size-3.5 shrink-0" />
                  <Select.ItemText>{newItem.label}</Select.ItemText>
                </Select.Item>
              </>
            )}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
