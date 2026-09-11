import type { HTMLAttributes, Ref, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'

/**
 * 表格基元(spec §7 面试记录表格卡):表头 subtle 底 11px muted;
 * 行下边框分隔、hover subtle;单元格内边距与文字规格给默认,可 className 覆写。
 * 仅结构化样式,不封装数据层——数据获取/空态由调用方组织。
 */

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  ref?: Ref<HTMLTableElement>
}

export function Table({ className, ref, ...props }: TableProps) {
  return <table ref={ref} className={cn('w-full border-collapse text-left', className)} {...props} />
}

export interface TableHeadProps extends HTMLAttributes<HTMLTableSectionElement> {
  ref?: Ref<HTMLTableSectionElement>
}

export function TableHead({ className, ref, ...props }: TableHeadProps) {
  return <thead ref={ref} className={cn('bg-subtle', className)} {...props} />
}

export interface TableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {
  ref?: Ref<HTMLTableSectionElement>
}

export function TableBody({ className, ref, ...props }: TableBodyProps) {
  return <tbody ref={ref} className={cn(className)} {...props} />
}

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  ref?: Ref<HTMLTableRowElement>
}

export function TableRow({ className, ref, ...props }: TableRowProps) {
  return <tr ref={ref} className={cn('border-b border-border transition-colors hover:bg-subtle', className)} {...props} />
}

export interface TableHeaderProps extends ThHTMLAttributes<HTMLTableCellElement> {
  ref?: Ref<HTMLTableCellElement>
}

export function TableHeader({ className, ref, ...props }: TableHeaderProps) {
  return <th ref={ref} className={cn('px-5 py-2 text-[11px] font-medium text-text-muted', className)} {...props} />
}

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  ref?: Ref<HTMLTableCellElement>
}

export function TableCell({ className, ref, ...props }: TableCellProps) {
  return <td ref={ref} className={cn('px-5 py-3.5 align-top text-[12px] text-text-regular', className)} {...props} />
}
