import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** 合并条件类名并去重 Tailwind 冲突;组件统一从这里取 cn */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
