import type { ReactNode } from 'react'
import { CheckCircle, WarningCircle } from '@phosphor-icons/react'
import { Toast } from '@base-ui/react'
import { cn } from '../../lib/cn'

/**
 * toast(spec §3.3/§10,2026-09-11 用户修订):顶部居中悬浮,150ms 下滑浮现;
 * 模块级 manager 供组件树外调用(toast.show(...)),Provider 挂一次于应用根。
 * 类型区分按业界惯例(AntD/Sonner):语义色实底 + 白字——info 深藏青(原设计)、
 * success 绿、error 红;success/error 前置白色状态图标。
 * 1.8.0 打包限制:createToastManager/useToastManager 仅可经 Toast 命名空间取值(parts 桶为值导出)。
 */
const manager = Toast.createToastManager()

export type AppToastType = 'info' | 'success' | 'error'

/** 动作按钮(「已移除资料 · 撤销」);点击后 toast 随即关闭 */
export interface ToastAction {
  label: string
  onClick?: () => void
}

export interface ToastOptions {
  type?: AppToastType
  /** 自动消失毫秒数,默认 5000;0 = 不自动消失 */
  duration?: number
  action?: ToastAction
}

/** 全局 toast 入口:toast.show('已保存') / toast.show('已移除资料', { action: { label: '撤销', onClick } }) */
export const toast = {
  show: (title: string, { type = 'info', duration = 5000, action }: ToastOptions = {}) =>
    manager.add({ title, type, timeout: duration, data: { action } }),
  /** 关闭指定 id 的 toast;不传 id 则关闭全部 */
  dismiss: (id?: string) => manager.close(id),
}

const typeStyles: Record<AppToastType, string> = {
  info: 'bg-overlay text-text-on-fill',
  success: 'bg-success text-text-on-fill',
  error: 'bg-danger text-text-on-fill',
}

function ToastIcon({ type }: { type: AppToastType }) {
  if (type === 'success') return <CheckCircle aria-hidden className="size-[15px] shrink-0" />
  if (type === 'error') return <WarningCircle aria-hidden className="size-[15px] shrink-0" />
  return null
}

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return toasts.map((item) => {
    const type: AppToastType = item.type === 'success' || item.type === 'error' ? item.type : 'info'
    const action = item.data?.action as ToastAction | undefined
    return (
      <Toast.Root
        key={item.id}
        toast={item}
        className={cn(
          'flex items-center gap-2 rounded-chip px-[18px] py-3 text-xs leading-[1.7] shadow-pop transition-[opacity,translate] duration-150 ease-standard data-[ending-style]:-translate-y-2.5 data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-2.5 data-[starting-style]:opacity-0',
          typeStyles[type],
        )}
      >
        <ToastIcon type={type} />
        {/* Title 渲染为 h2,直接命中才能压过 legacy 层 h1-h3 的 color 规则(继承会输给直接规则) */}
        <Toast.Title className="text-inherit" />
        {action && (
          <button
            type="button"
            onClick={() => {
              action.onClick?.()
              manager.close(item.id)
            }}
            className="ml-1 shrink-0 rounded-chip border border-text-on-fill/40 px-1.5 py-px text-[10.5px] font-medium text-text-on-fill transition-colors hover:bg-text-on-fill/10"
          >
            {action.label}
          </button>
        )}
      </Toast.Root>
    )
  })
}

export function AppToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={manager}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="pointer-events-none fixed top-[64px] left-1/2 z-[100] flex w-max max-w-[90vw] -translate-x-1/2 flex-col items-center gap-2">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}
