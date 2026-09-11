/*
 * 文档站壳:顶栏(搜索)+ 分组侧栏 + hash 路由 + 组件节(多示例卡片 + Props 表)。
 * 常驻组件预览站(2026-09-11 用户确认:重构后保留 playground/,长期用于组件修改的即时预览);
 * 文档本体在 registry.ts / demos.tsx。每示例一张卡:预览/代码切换,代码区迷你高亮(highlight.tsx)+ 一键复制。
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Check, Copy, MagnifyingGlass } from '@phosphor-icons/react'
import { GROUPS, componentDocs, type ComponentDoc, type PropRow } from './registry'
import { demoExamples } from './demos'
import { HighlightedCode } from './highlight'
import { controlClass } from '@/components/ui/field'
import { AppToastProvider } from '@/components/ui/toast'
import { cn } from '@/lib/cn'

const TOKEN_ENTRY = { id: 'token', name: 'Tokens', title: '设计令牌', group: '令牌' } as const

type NavEntry = { id: string; name: string; title: string; group: string }

const NAV_ENTRIES: NavEntry[] = [
  ...componentDocs.map((doc) => ({ id: doc.id, name: doc.name, title: doc.title, group: doc.group })),
  TOKEN_ENTRY,
]

function goToSection(id: string) {
  // pushState 不触发 hashchange,active 由调用方显式同步;此处只管地址栏与滚动
  history.pushState(null, '', `#${id}`)
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      aria-label={copied ? '已复制' : '复制代码'}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code)
          setCopied(true)
        } catch {
          /* 非 https / 无剪贴板权限环境静默跳过 */
        }
      }}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-chip transition-colors',
        copied ? 'text-success' : 'text-text-muted hover:bg-card hover:text-text-primary',
      )}
    >
      {copied ? <Check weight="bold" className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  )
}

function DemoCard({ label, code, children }: { label: string; code: string; children: ReactNode }) {
  const [showCode, setShowCode] = useState(false)
  return (
    <div className="mt-4 overflow-hidden rounded-control border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-subtle px-3 py-1">
        <span className="text-[11.5px] font-medium text-text-secondary">{label}</span>
        <span className="font-mono text-[10px] tracking-[0.14em] text-text-muted uppercase">
          {showCode ? 'code' : 'preview'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {showCode && <CopyButton code={code} />}
          <button
            type="button"
            onClick={() => setShowCode((value) => !value)}
            className="rounded-chip px-2 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-card hover:text-text-primary"
          >
            {showCode ? '看预览' : '看代码'}
          </button>
        </div>
      </div>
      {showCode ? (
        <pre className="overflow-auto bg-canvas p-4 font-mono text-[11.5px] leading-[1.8] whitespace-pre">
          <HighlightedCode code={code} />
        </pre>
      ) : (
        <div className="bg-canvas p-5">{children}</div>
      )}
    </div>
  )
}

function PropsTable({ rows }: { rows: PropRow[] }) {
  return (
    <details className="mt-4 rounded-control border border-border bg-card">
      <summary className="cursor-pointer px-3.5 py-2.5 text-[11.5px] font-medium text-text-secondary transition-colors hover:text-text-primary">
        Props({rows.length})
      </summary>
      <div className="overflow-x-auto px-3.5 pb-3">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-border-strong text-[11px] text-text-muted">
              <th className="py-2 pr-3 font-medium">Prop</th>
              <th className="py-2 pr-3 font-medium">类型</th>
              <th className="py-2 pr-3 font-medium">默认</th>
              <th className="py-2 font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-border last:border-0 align-top">
                <td className="py-2 pr-3 font-mono text-[11.5px] whitespace-nowrap text-accent-text">{row.name}</td>
                <td className="py-2 pr-3 font-mono text-[11px] whitespace-nowrap text-text-secondary">{row.type}</td>
                <td className="py-2 pr-3 font-mono text-[11px] whitespace-nowrap text-text-secondary">{row.def ?? '—'}</td>
                <td className="py-2 text-text-regular">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function SectionHeading({ name, title }: { name: string; title: string }) {
  return (
    <h2 className="flex items-baseline gap-2.5">
      <span className="font-[650] text-lg text-text-heading">{name}</span>
      <span className="text-[13px] text-text-secondary">{title}</span>
    </h2>
  )
}

function ComponentSection({ doc }: { doc: ComponentDoc }) {
  const examples = demoExamples[doc.id] ?? []
  return (
    <section id={doc.id} className="scroll-mt-16">
      <SectionHeading name={doc.name} title={doc.title} />
      <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">{doc.description}</p>
      {doc.examples.map((example, index) => {
        const Demo = examples[index]?.component
        return Demo ? (
          <DemoCard key={example.label} label={example.label} code={example.code}>
            <Demo />
          </DemoCard>
        ) : null
      })}
      <PropsTable rows={doc.props} />
    </section>
  )
}

function TokenSection() {
  const Demo = demoExamples[TOKEN_ENTRY.id]?.[0]?.component
  return (
    <section id={TOKEN_ENTRY.id} className="scroll-mt-16">
      <SectionHeading name={TOKEN_ENTRY.name} title={TOKEN_ENTRY.title} />
      <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">
        @theme 全量令牌(spec §17.1):值经 getComputedStyle 运行时读取,与 tokens.css 永远同步。主题切换(未来)只改变量值,本页即预览。
      </p>
      <div className="mt-4 rounded-control border border-border bg-card p-5">
        {Demo ? <Demo /> : null}
      </div>
    </section>
  )
}

export default function App() {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState('')

  useEffect(() => {
    const apply = () => {
      const id = window.location.hash.slice(1)
      setActive(id)
      if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [])

  const keyword = query.trim().toLowerCase()
  const matches = (entry: { id: string; name: string }) => {
    if (!keyword) return true
    const doc = componentDocs.find((item) => item.id === entry.id)
    return [entry.id, entry.name, doc?.title ?? '', doc?.description ?? '']
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  }
  const filteredDocs = componentDocs.filter((doc) => matches(doc))
  const tokenVisible = matches({ id: TOKEN_ENTRY.id, name: TOKEN_ENTRY.name })
  const hasResults = filteredDocs.length > 0 || tokenVisible

  return (
    <AppToastProvider>
      <div className="flex min-h-dvh flex-col bg-page">
        <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-4 border-b border-border bg-page/95 px-6 backdrop-blur">
          <span className="font-mono text-[11px] font-bold tracking-[0.16em] text-accent-text uppercase">
            Interview Copilot UI · V30
          </span>
          <div className="relative ml-auto w-[220px]">
            <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索组件…"
              aria-label="搜索组件"
              className={cn(controlClass, 'py-1.5 pl-8 text-[12px]')}
            />
          </div>
        </header>

        <div className="flex flex-1">
          <aside className="sticky top-12 hidden h-[calc(100dvh-3rem)] w-[260px] shrink-0 overflow-auto border-r border-border bg-canvas py-6 pr-3 pl-5 md:block">
            {[...GROUPS, TOKEN_ENTRY.group].map((group) => {
              const items = NAV_ENTRIES.filter((entry) => entry.group === group && matches(entry))
              if (items.length === 0) return null
              return (
                <div key={group} className="mb-5 last:mb-0">
                  <div className="mb-1.5 px-2.5 font-mono text-[10px] font-bold tracking-[0.16em] text-text-muted uppercase">
                    {group}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {items.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          setActive(entry.id)
                          goToSection(entry.id)
                        }}
                        className={cn(
                          'flex h-[30px] w-full items-center gap-2 overflow-hidden rounded-control px-2.5 text-left transition-colors',
                          active === entry.id
                            ? 'bg-card font-semibold text-accent-text shadow-card ring-1 ring-accent-line'
                            : 'text-text-secondary hover:bg-card hover:text-text-primary',
                        )}
                      >
                        <span className="truncate text-[12.5px]">{entry.name}</span>
                        <span className="ml-auto shrink-0 text-[11px] font-normal text-text-muted">{entry.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </aside>

          <main className="min-w-0 flex-1">
            <div className="mx-auto max-w-[780px] px-8 py-6">
              {hasResults ? (
                <div className="flex flex-col gap-10">
                  {filteredDocs.map((doc) => (
                    <ComponentSection key={doc.id} doc={doc} />
                  ))}
                  {tokenVisible && <TokenSection />}
                  <footer className="pb-8 font-mono text-[10.5px] text-text-muted">
                    v30 playground · 组件在 src/renderer/src/components/ui · 令牌在 styles/tokens.css · 常驻预览站,主应用不引用本目录
                  </footer>
                </div>
              ) : (
                <p className="py-20 text-center text-[12.5px] text-text-muted">没有匹配「{query.trim()}」的组件</p>
              )}
            </div>
          </main>
        </div>
      </div>
    </AppToastProvider>
  )
}
