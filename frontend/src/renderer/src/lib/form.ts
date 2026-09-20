/**
 * 表单与反馈共享原语(语义 Tailwind 组合,全站含登录页统一使用)。
 */

/** 纵排 label + 控件:label 12px/500,内部控件字重还原 */
export const fieldClass =
  'mb-4 flex min-w-0 flex-col gap-2 text-xs font-medium [&_input]:font-normal [&_select]:font-normal [&_textarea]:font-normal'

/** 双列字段行;窄屏折单列 */
export const fieldRowClass =
  'grid grid-cols-2 gap-4 max-[560px]:grid-cols-[minmax(0,1fr)] max-[560px]:gap-0'

/** 次要说明文字 */
export const formNoteClass =
  'mb-4 text-xs leading-[1.85] text-text-secondary [overflow-wrap:anywhere]'

/** 行内错误条 */
export const inlineErrorClass =
  'mt-3 rounded-chip bg-danger-subtle p-3 text-xs text-danger [overflow-wrap:anywhere]'

/** 成功提示条 */
export const successNoticeClass =
  'mt-3 flex items-center gap-2 rounded-chip bg-success-subtle p-3 text-xs text-success [&_svg]:shrink-0'

/** 表单底部:状态文字 + 主操作 */
export const contextFooterClass =
  'flex items-center justify-between gap-3 [&>span]:text-xs [&>span]:text-text-muted'

/** 中性文字按钮(编辑/查看等;危险文字按钮用 ui/button 的 TextButton) */
export const textButtonClass =
  'inline-flex items-center gap-2 border-0 bg-transparent px-0 py-1 text-xs text-text-secondary'
