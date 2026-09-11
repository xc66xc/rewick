import type { Ref } from 'react'
import { cn } from '../../lib/cn'

/** 取名字首字母:拉丁名取前两词首字母大写("Lin Xu"→"LX");中文名取首字("林序"→"林") */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  const word = words[0] ?? ''
  if (!word) return '?'
  return /[一-鿿]/.test(word[0]) ? word.slice(0, 1) : word.slice(0, 2).toUpperCase()
}

export interface AvatarProps {
  /** 显示名(用于生成兜底首字母) */
  name: string
  /** 头像图片地址;提供则优先渲染图片 */
  src?: string
  /** 直径(px),默认 31(侧栏 profile 规格,spec §3.1) */
  size?: number
  className?: string
  ref?: Ref<HTMLSpanElement>
}

/** .avatar(spec §3.1):圆形浅蓝底 + accent 首字母(10.5/600);蓝底即 accent-subtle 系 */
export function Avatar({ name, src, size = 31, className, ref }: AvatarProps) {
  return (
    <span
      ref={ref}
      style={{ width: size, height: size }}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-accent-subtle text-accent-text',
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full rounded-full object-cover" />
      ) : (
        <span className="text-[10.5px] leading-none font-semibold" style={{ fontSize: Math.max(9, size * 0.34) }}>
          {initialsOf(name)}
        </span>
      )}
    </span>
  )
}
