import type { ReactNode } from 'react'
import { CaretDown, Check, DotsThree } from '@phosphor-icons/react'
import { Menu as BaseMenu } from '@base-ui/react'
import { cn } from '../../lib/cn'
import { buttonVariants, iconButtonClass } from './button'

export type MenuEntry =
  | {
      kind?: 'item'
      value: string
      label: ReactNode
      icon?: ReactNode
      /** 危险项(移除等):红字,高亮浅红底 */
      danger?: boolean
      disabled?: boolean
      /** 勾选态(排序方式/视图切换类菜单):行首显示 ✓ 替代 icon;选中语义由触发器文字体现 */
      checked?: boolean
    }
  | { kind: 'divider' }
  | { kind: 'label'; label: ReactNode }

export interface DropdownMenuProps {
  /** 触发器内容(默认套 Button default 样式,尾部自动加下拉箭头) */
  trigger?: ReactNode
  items: MenuEntry[]
  /** 触发器形态:icon = 36×36「⋯」图标钮(资料行等高密度行的动作收纳);此时 trigger 忽略、aria-label 必给 */
  iconTrigger?: boolean
  /** 点击 item 时回调其 value(item 点击后菜单自动关闭) */
  onValueChange?: (value: string) => void
  /** 菜单相对触发器的对齐,默认 start */
  align?: 'start' | 'center' | 'end'
  className?: string
  'aria-label'?: string
}

/**
 * 下拉动作菜单(2026-09-11 基建外推,设计稿未画):Base UI Menu,
 * 键盘 ↑↓/Home/End 导航、字符匹配、Esc/外点关闭;高亮态 data-highlighted。
 * 用于动作密度高的行(资料行/转写条)收纳二级操作。
 */
export function DropdownMenu({
  trigger,
  items,
  iconTrigger = false,
  onValueChange,
  align = 'start',
  className,
  'aria-label': ariaLabel,
}: DropdownMenuProps) {
  return (
    <BaseMenu.Root>
      {iconTrigger ? (
        <BaseMenu.Trigger aria-label={ariaLabel} className={iconButtonClass}>
          <DotsThree />
        </BaseMenu.Trigger>
      ) : (
        <BaseMenu.Trigger aria-label={ariaLabel} className={cn(buttonVariants(), '[&_svg]:size-3.5')}>
          {trigger}
          <CaretDown className="text-text-muted" />
        </BaseMenu.Trigger>
      )}
      <BaseMenu.Portal>
        <BaseMenu.Positioner align={align} sideOffset={6} className="z-[90]">
          <BaseMenu.Popup
            className={cn('min-w-[180px] rounded-control border border-border bg-card py-1.5 shadow-pop', className)}
          >
            {items.map((item, index) => {
              if (item.kind === 'divider') {
                return <BaseMenu.Separator key={`divider-${index}`} className="mx-2 my-1 h-px bg-border" />
              }
              if (item.kind === 'label') {
                return (
                  <div
                    key={`label-${index}`}
                    className="px-3 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-wide text-text-muted"
                  >
                    {item.label}
                  </div>
                )
              }
              return (
                <BaseMenu.Item
                  key={item.value}
                  disabled={item.disabled}
                  onClick={() => onValueChange?.(item.value)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-[4px] px-3 py-[7px] text-[12.5px] text-text-regular outline-none transition-colors data-[highlighted]:bg-subtle data-[highlighted]:text-text-primary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 [&_svg]:size-[15px] [&_svg]:shrink-0 [&_svg]:text-text-muted',
                    item.danger &&
                      'text-danger data-[highlighted]:bg-danger-subtle data-[highlighted]:text-danger data-[highlighted]:[&_svg]:text-danger',
                  )}
                >
                  {item.checked ? (
                    <Check aria-hidden className="text-accent-text!" />
                  ) : (
                    item.icon
                  )}
                  {item.label}
                </BaseMenu.Item>
              )
            })}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}
