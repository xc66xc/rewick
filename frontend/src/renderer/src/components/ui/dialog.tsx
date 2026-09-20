import { useEffect, type ReactNode } from 'react'
import { Dialog } from '@base-ui/react'
import { X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { pushWindowScrim } from '../../lib/window-scrim'
import { Button, IconButton } from './button'

/**
 * .modal 壳(spec §8):head/body/foot 三段;宽度 md=600(默认)/ lg=680(设置)。
 * Base UI Dialog:modal=true(焦点陷阱 + 滚动锁),Esc/点遮罩关闭。
 * body 结构可整体替换(设置弹窗是 168px 左导航网格),给 bodyClassName。
 * 打开期间上报 window-scrim 信号(Windows 下主进程把 WCO 标题条着色成遮罩同色)。
 */
export function Modal({
  open,
  onOpenChange,
  title,
  children,
  footer,
  width = 'md',
  bodyClassName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: 'md' | 'lg'
  bodyClassName?: string
}) {
  useEffect(() => {
    if (!open) return
    pushWindowScrim(true)
    return () => pushWindowScrim(false)
  }, [open])
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => onOpenChange(nextOpen)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-scrim" />
        <Dialog.Popup
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-card border border-border bg-card shadow-pop outline-none',
            width === 'lg' ? 'w-[min(680px,calc(100vw-40px))]' : 'w-[min(600px,calc(100vw-40px))]',
          )}
        >
          <header className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3.5">
            <Dialog.Title className="font-[650] text-lg text-text-heading">{title}</Dialog.Title>
            <Dialog.Close render={<IconButton aria-label="关闭" />}>
              <X />
            </Dialog.Close>
          </header>
          <div className={cn('max-h-[60dvh] overflow-auto px-6 py-[22px]', bodyClassName)}>{children}</div>
          {footer !== undefined && (
            <footer className="mt-auto flex shrink-0 items-center justify-end gap-2 border-t border-border bg-subtle px-6 py-2.5">
              {footer}
            </footer>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export interface ConfirmModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  /** 正文(§8.6 确认弹窗:13px / 1.9 行高 secondary 色) */
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  /** 危险确认(移除/删除):确认键换红实底 */
  danger?: boolean
  /** 点击确认后触发,随后弹窗自动关闭(异步结果用 toast 反馈,业界惯例) */
  onConfirm?: () => void
}

/**
 * .modal#confirmDialog(spec §8.6)的封装:标题 + 一段说明 + 取消/确认双钮。
 * 移除资料、删除准备、结束会话等确认场景直接用它,不再手拼 footer。
 */
export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  onConfirm,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{cancelText}</Button>
          <Button
            variant="primary"
            className={danger ? 'border-danger bg-danger hover:bg-danger/90 active:bg-danger' : undefined}
            onClick={() => {
              onConfirm?.()
              onOpenChange(false)
            }}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      {description !== undefined && <p className="text-[13px] leading-[1.9] text-text-secondary">{description}</p>}
    </Modal>
  )
}
