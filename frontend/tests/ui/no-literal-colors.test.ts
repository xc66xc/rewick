/*
 * 纪律红线机器化(2026-09-11):components/ui 与 lib 内禁止字面色。
 * 检测:hex 字面量 / Tailwind white/black 色工具类 / 任意值语法里的颜色函数 / rgb·hsl 等颜色函数。
 * 令牌唯一合法来源 = styles/tokens.css(不在扫描范围)。
 * 行内豁免:该行含「allow-literal-color」注释即跳过(应极少用,用则须在 PR 说明理由)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src/renderer/src/components/ui', 'src/renderer/src/lib'].map((dir) => join(process.cwd(), dir))

const RULES: Array<{ name: string; pattern: RegExp }> = [
  { name: 'hex 字面量(如 #134cff)', pattern: /#[0-9a-fA-F]{3,8}\b/ },
  {
    name: 'Tailwind white/black 色类(text-white/bg-black 等,应改用 text-on-fill/scrim 令牌)',
    pattern: /\b(?:bg|text|border|ring|outline|fill|stroke|from|to|via|divide|caret|accent|decoration|shadow)-(?:white|black)(?:\/\d+)?\b/,
  },
  {
    name: '任意值语法中的颜色(bg-[#fff] / text-[rgb(...)] 等)',
    pattern: /-\[(?:#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\(|hwb\(|lab\(|lch\(|color\()/,
  },
  { name: '颜色函数(inline style / 自定义 CSS)', pattern: /\brgba?\(|\bhsla?\(|\boklch\(|\boklab\(|\bhwb\(/ },
]

function collect(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return collect(full)
    return /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

describe('禁字面色(纪律红线)', () => {
  it('components/ui 与 lib 中无任何字面色', () => {
    const violations: string[] = []
    for (const root of ROOTS) {
      for (const file of collect(root)) {
        readFileSync(file, 'utf8')
          .split(/\r?\n/)
          .forEach((line, index) => {
            if (line.includes('allow-literal-color')) return
            for (const rule of RULES) {
              if (rule.pattern.test(line)) {
                violations.push(`${file.replace(process.cwd() + '\\', '').replace(process.cwd() + '/', '')}:${index + 1} [${rule.name}] ${line.trim()}`)
              }
            }
          })
      }
    }
    expect(violations, `发现字面色:\n${violations.join('\n')}\n→ 应改用 styles/tokens.css 语义令牌`).toEqual([])
  })
})
