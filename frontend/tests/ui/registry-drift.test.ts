/*
 * registry 漂移检测(2026-09-11,CI 防腐第 2 钉):
 * 1. 组件源码 own props(TS AST 解析)必须 ⊆ registry.ts props 行 ∪ 通用透传白名单
 *    —— 给组件加 prop 而不更新文档,测试即红;反向(文档多记)不拦。
 * 2. registry.examples 的 label 必须与 demos.tsx demoExamples[id] 的 label 一一对应,
 *    且每个组件 id 都有演示 —— 多示例文档的两半不许漂移。
 * 3. demos.tsx 用 AST 读 label(不 import),本测试保持 node 环境零 DOM 依赖。
 * 豁免:pill / table(多导出复合行)、toast(模块级 API 非 props 组件)。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { GROUPS, componentDocs, type PropRow } from '../../playground/registry'

const UI_DIR = join(process.cwd(), 'src/renderer/src/components/ui')
const DEMOS_FILE = join(process.cwd(), 'playground/demos.tsx')

/** 通用透传:所有组件都该有,不要求 registry 单列 */
const ALLOWLIST = new Set(['ref', 'className', 'children', 'id', 'aria-label'])

/** 受检组件:registry id → (文件, 主导出函数们) */
const TARGETS: Array<{ id: string; file: string; fns: string[] }> = [
  { id: 'slider', file: 'slider.tsx', fns: ['Slider'] },
  { id: 'button', file: 'button.tsx', fns: ['Button', 'IconButton', 'LinkButton', 'TextButton'] },
  { id: 'switch', file: 'switch.tsx', fns: ['ToggleSwitch'] },
  { id: 'segmented', file: 'segmented.tsx', fns: ['Segmented'] },
  { id: 'field', file: 'field.tsx', fns: ['TextField', 'TextareaField'] },
  { id: 'select', file: 'select.tsx', fns: ['AppSelect'] },
  { id: 'check-row', file: 'check-row.tsx', fns: ['CheckRow', 'ChoiceRow'] },
  { id: 'tabs', file: 'tabs.tsx', fns: ['TabBar'] },
  { id: 'meter', file: 'meter.tsx', fns: ['LevelMeter'] },
  { id: 'collapsible', file: 'collapsible.tsx', fns: ['Collapse'] },
  { id: 'tooltip', file: 'tooltip.tsx', fns: ['Tooltip'] },
  { id: 'menu', file: 'menu.tsx', fns: ['DropdownMenu'] },
  { id: 'badge', file: 'badge.tsx', fns: ['Badge'] },
  { id: 'kbd', file: 'kbd.tsx', fns: ['Kbd'] },
  { id: 'divider', file: 'divider.tsx', fns: ['Divider'] },
  { id: 'avatar', file: 'avatar.tsx', fns: ['Avatar'] },
  { id: 'empty-state', file: 'empty-state.tsx', fns: ['EmptyState'] },
  { id: 'skeleton', file: 'skeleton.tsx', fns: ['Skeleton'] },
  { id: 'dialog', file: 'dialog.tsx', fns: ['Modal', 'ConfirmModal'] },
]

function parseFile(path: string) {
  return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
}

function memberName(member: ts.TypeElement, sf: ts.SourceFile): string {
  if (!member.name) return ''
  return member.name.getText(sf).replace(/^['"]|['"]$/g, '')
}

/** 函数首参 props 的 own 成员名(内联字面量或同文件具名 interface 的自有成员,不含继承) */
function ownProps(sf: ts.SourceFile, fnName: string): string[] {
  const fn = sf.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === fnName,
  )
  const paramType = fn?.parameters[0]?.type
  if (!fn || !paramType) throw new Error(`${fnName} 未找到或无 props 参数`)
  let members: readonly ts.TypeElement[]
  if (ts.isTypeLiteralNode(paramType)) {
    members = paramType.members
  } else if (ts.isTypeReferenceNode(paramType) && ts.isIdentifier(paramType.typeName)) {
    const typeName = paramType.typeName.text
    const interfaceDecl = sf.statements.find(
      (statement): statement is ts.InterfaceDeclaration =>
        ts.isInterfaceDeclaration(statement) && statement.name.text === typeName,
    )
    if (!interfaceDecl) throw new Error(`${fnName} 的 props 类型 ${typeName} 非同文件 interface`)
    members = interfaceDecl.members
  } else {
    throw new Error(`${fnName} 的 props 类型形态不支持:${paramType.getText(sf)}`)
  }
  return members
    .filter((member) => ts.isPropertySignature(member) || ts.isMethodSignature(member))
    .map((member) => memberName(member, sf))
}

/** registry props 行 → prop 名集合:'checked / defaultChecked' 拆两半,'ChoiceRow.description' 去前缀,'…原生' 等非标识符丢弃 */
function rowProps(rows: PropRow[]): Set<string> {
  const names = new Set<string>()
  for (const row of rows) {
    for (const part of row.name.split('/')) {
      const cleaned = part.trim().replace(/^\w+\./, '').replace(/^['"]|['"]$/g, '')
      if (/^[A-Za-z$' _-][\w$-]*$/.test(cleaned)) names.add(cleaned)
    }
  }
  return names
}

/** AST 读 demos.tsx 的 demoExamples → { id: [label, …] }(不 import,保持零 DOM) */
function demoLabels(): Record<string, string[]> {
  const sf = parseFile(DEMOS_FILE)
  const statement = sf.statements.find(
    (node): node is ts.VariableStatement =>
      ts.isVariableStatement(node) &&
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true &&
      node.declarationList.declarations.some(
        (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === 'demoExamples',
      ),
  )
  const initializer = statement?.declarationList.declarations[0]?.initializer
  if (!statement || !initializer || !ts.isObjectLiteralExpression(initializer)) {
    throw new Error('demos.tsx 中未找到 export const demoExamples 对象字面量')
  }
  const result: Record<string, string[]> = {}
  for (const property of initializer.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const id = ts.isIdentifier(property.name)
      ? property.name.text
      : ts.isStringLiteral(property.name)
        ? property.name.text
        : null
    if (!id) continue
    const examples = ts.isArrayLiteralExpression(property.initializer) ? property.initializer.elements : []
    result[id] = examples.flatMap((element) => {
      if (!ts.isObjectLiteralExpression(element)) return []
      const label = element.properties.find(
        (prop): prop is ts.PropertyAssignment =>
          ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'label',
      )
      return label && ts.isStringLiteral(label.initializer) ? [label.initializer.text] : []
    })
  }
  return result
}

describe('registry 漂移检测(防腐)', () => {
  it('每个受检组件的 own props 都已记录在 registry(或属通用透传白名单)', () => {
    const docById = new Map(componentDocs.map((doc) => [doc.id, doc]))
    const violations: string[] = []
    for (const target of TARGETS) {
      const doc = docById.get(target.id)
      if (!doc) {
        violations.push(`registry 缺少组件条目:${target.id}`)
        continue
      }
      const documented = rowProps(doc.props)
      const sf = parseFile(join(UI_DIR, target.file))
      for (const fn of target.fns) {
        for (const prop of ownProps(sf, fn)) {
          if (!documented.has(prop) && !ALLOWLIST.has(prop)) {
            violations.push(`${fn}.${prop} 未记录 → 请在 registry.ts「${doc.name}」的 props 补一行`)
          }
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([])
  })

  it('registry.examples 与 demoExamples 的 label 一一对应,且组件不缺演示', () => {
    const demos = demoLabels()
    const problems: string[] = []
    for (const doc of componentDocs) {
      const labels = demos[doc.id]
      if (!labels || labels.length === 0) {
        problems.push(`${doc.id}:demos.tsx 无演示`)
        continue
      }
      const expected = doc.examples.map((example) => example.label)
      if (JSON.stringify(expected) !== JSON.stringify(labels)) {
        problems.push(`${doc.id}:registry=${JSON.stringify(expected)} demos=${JSON.stringify(labels)}`)
      }
    }
    const knownIds = new Set([...componentDocs.map((doc) => doc.id), 'token'])
    for (const id of Object.keys(demos)) {
      if (!knownIds.has(id)) problems.push(`demos.tsx 多出未知演示:${id}(registry 无此组件)`)
    }
    expect(problems, problems.join('\n')).toEqual([])
  })

  it('registry 分组合法且 id 唯一', () => {
    const ids = componentDocs.map((doc) => doc.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const doc of componentDocs) {
      if (!GROUPS.includes(doc.group as (typeof GROUPS)[number])) {
        expect.fail(`${doc.id} 的 group「${doc.group}」不在 GROUPS 内`)
      }
    }
  })
})
