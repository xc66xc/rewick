import type { ReactNode } from 'react'

/*
 * 迷你 JSX 语法高亮(零依赖,2026-09-11):只服务 registry.ts 里人工维护的用法片段,
 * 语料可控,不追求完备。配色全走语义令牌:标签=accent-text、属性/关键字=violet、
 * 字符串=success、注释与标点=text-muted、正文=text-regular。
 */

const PATTERN =
  /(\/\/[^\n]*)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(<\/?[A-Za-z][\w.]*|\/>|<\/)|(\b(?:const|let|function|return|import|from|export|default|true|false|null|undefined|typeof|as)\b)|(\{|\}|\(|\)|=>|;)|([A-Za-z_$][\w$]*)(?==)/g

const CLASSES: Record<number, string> = {
  1: 'text-text-muted italic', // 注释
  2: 'text-success', // 字符串
  3: 'text-accent-text', // 标签
  4: 'font-semibold text-violet', // 关键字
  5: 'text-text-muted', // 标点
  6: 'text-violet', // 属性名
}

export function HighlightedCode({ code }: { code: string }): ReactNode {
  const nodes: ReactNode[] = []
  let cursor = 0
  let key = 0
  PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = PATTERN.exec(code)) !== null) {
    if (match.index > cursor) nodes.push(code.slice(cursor, match.index))
    const groupIndex = match.slice(1).findIndex((value) => value !== undefined) + 1
    nodes.push(
      <span key={key++} className={CLASSES[groupIndex] ?? undefined}>
        {match[0]}
      </span>,
    )
    cursor = match.index + match[0].length
  }
  if (cursor < code.length) nodes.push(code.slice(cursor))
  return <>{nodes}</>
}
