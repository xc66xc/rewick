import { Slider } from '@/components/ui/slider'
/*
 * 演示画布:每组件若干带标签的示例(状态本地化),按 registry id 组织。
 * label 与 registry.ts 的 examples 一一对应(tests/ui/registry-drift.test.ts 钉死同步)。
 */
import { useEffect, useState, type ComponentType } from 'react'
import {
  ArrowClockwise,
  ArrowUp,
  ArrowUpRight,
  Briefcase,
  CheckCircle,
  Eye,
  FileText,
  MagnifyingGlass,
  Microphone,
  Monitor,
  Plus,
  PushPin,
  Sparkle,
  Trash,
  UploadSimple,
  Waveform,
} from '@phosphor-icons/react'
import { Button, IconButton, LinkButton, TextButton, buttonDangerClass } from '@/components/ui/button'
import { Dot, Eyebrow, Pill, StatusPill } from '@/components/ui/pill'
import { ToggleSwitch } from '@/components/ui/switch'
import { Segmented } from '@/components/ui/segmented'
import { FieldRow, TextField, TextareaField } from '@/components/ui/field'
import { ConfirmModal, Modal } from '@/components/ui/dialog'
import { AppSelect } from '@/components/ui/select'
import { TabBar } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'
import { Collapse } from '@/components/ui/collapsible'
import { LevelMeter } from '@/components/ui/meter'
import { CheckRow, ChoiceRow } from '@/components/ui/check-row'
import { Tooltip } from '@/components/ui/tooltip'
import { Kbd } from '@/components/ui/kbd'
import { EmptyState } from '@/components/ui/empty-state'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Divider } from '@/components/ui/divider'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

/* ── Button ── */

function ButtonVariantsDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button>导入资料</Button>
      <Button variant="primary">保存设置</Button>
      <Button variant="quiet">取消</Button>
      <Button variant="outline">加入问题</Button>
    </div>
  )
}

function ButtonSizesDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" size="sm">生成回答</Button>
      <Button variant="outline" size="xs"><ArrowUpRight />回答这句</Button>
      <Button variant="primary" size="xs"><ArrowUpRight />回答这句</Button>
    </div>
  )
}

function ButtonMiscDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="quiet"><Plus />新会话</Button>
      <IconButton aria-label="置顶"><CheckCircle /></IconButton>
      <LinkButton>查看回答<ArrowUpRight /></LinkButton>
      <TextButton>退出登录</TextButton>
      <Button variant="outline" size="xs" className={buttonDangerClass}><Trash />移除</Button>
      <Button variant="outline" size="xs" disabled><ArrowClockwise />重建索引</Button>
    </div>
  )
}

function ButtonLoadingDemo() {
  const [generating, setGenerating] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="primary"
        loading={generating}
        onClick={() => {
          setGenerating(true)
          setTimeout(() => setGenerating(false), 1600)
        }}
      >
        {generating ? '生成中…' : '生成回答'}
      </Button>
      <Button variant="outline" loading>重建索引</Button>
    </div>
  )
}

/* ── Pill ── */

function PillInfoDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Pill><Dot />当前使用</Pill>
      <Pill>技术二面</Pill>
      <Pill><UploadSimple />3 份参考资料</Pill>
    </div>
  )
}

function PillStatusDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <StatusPill status="ready">可用</StatusPill>
      <StatusPill status="busy">建索引中</StatusPill>
      <StatusPill status="pending">等待建索引</StatusPill>
      <StatusPill status="error">处理失败</StatusPill>
    </div>
  )
}

function PillEyebrowDemo() {
  return <Eyebrow>SECTION LABEL</Eyebrow>
}

/* ── ToggleSwitch ── */

function SwitchSizesDemo() {
  const [autoAnswer, setAutoAnswer] = useState(true)
  const [retrieval, setRetrieval] = useState(true)
  return (
    <div className="flex flex-wrap items-center gap-5">
      <ToggleSwitch checked={autoAnswer} onCheckedChange={setAutoAnswer} label="自动回答" size="sm" />
      <ToggleSwitch
        checked={retrieval}
        onCheckedChange={setRetrieval}
        label="使用参考资料"
        description="回答前从简历、岗位与参考资料中检索相关片段"
      />
    </div>
  )
}

function SwitchDisabledDemo() {
  return <ToggleSwitch defaultChecked={false} disabled label="系统音频自动回答" />
}

/* ── Segmented ── */

function SegmentedSourceDemo() {
  const [source, setSource] = useState('system')
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented
        value={source}
        onValueChange={setSource}
        aria-label="音源"
        options={[
          { value: 'system', label: '系统音频', icon: <Monitor /> },
          { value: 'mic', label: '麦克风', icon: <Microphone /> },
        ]}
      />
      <span className="text-[11px] text-text-muted">当前:{source === 'system' ? '系统音频' : '麦克风'}</span>
    </div>
  )
}

/* ── Tooltip ── */

function TooltipDemo() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Tooltip content="置顶预览窗(Electron alwaysOnTop)">
        <IconButton aria-label="置顶"><PushPin /></IconButton>
      </Tooltip>
      <Tooltip content="回答模型 · 点击在设置中修改" side="bottom">
        <Button variant="quiet">DeepSeek V3</Button>
      </Tooltip>
      <Tooltip content="侧方位" side="right">
        <Button variant="outline">side=right</Button>
      </Tooltip>
    </div>
  )
}

/* ── DropdownMenu ── */

function MenuDemo() {
  const [last, setLast] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-4">
      <DropdownMenu
        trigger="更多操作"
        onValueChange={setLast}
        items={[
          { kind: 'label', label: '资料操作' },
          { value: 'preview', label: '预览', icon: <Eye /> },
          { value: 'reindex', label: '重建索引', icon: <ArrowClockwise />, disabled: true },
          { kind: 'divider' },
          { value: 'remove', label: '移除', icon: <Trash />, danger: true },
        ]}
      />
      <span className="text-[11px] text-text-muted">{last ? `onValueChange("${last}")` : '键盘 ↑↓ 也可导航'}</span>
    </div>
  )
}

function MenuIconDemo() {
  const [sort, setSort] = useState('recent')
  return (
    <div className="flex flex-wrap items-center gap-4">
      <DropdownMenu
        iconTrigger
        aria-label="排序方式"
        onValueChange={setSort}
        items={[
          { value: 'recent', label: '最近使用', checked: sort === 'recent' },
          { value: 'name', label: '名称', checked: sort === 'name' },
          { kind: 'divider' },
          { value: 'remove', label: '移除', danger: true },
        ]}
      />
      <span className="text-[11px] text-text-muted">排序:{sort === 'recent' ? '最近使用' : '名称'}</span>
    </div>
  )
}

/* ── Badge / Kbd / Divider ── */

function BadgeDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex items-center gap-2 text-[13px] text-text-secondary">
        我的简历 <Badge>02</Badge>
      </span>
      <span className="flex items-center gap-2 text-[13px] text-text-secondary">
        目标岗位 <Badge>02</Badge>
      </span>
      <span className="flex items-center gap-2 text-[13px] text-text-secondary">
        参考资料 <Badge>99+</Badge>
      </span>
    </div>
  )
}

function KbdDemo() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button variant="primary" size="sm">
        生成回答<ArrowUp /><Kbd>⌘ ↵</Kbd>
      </Button>
      <span className="text-[11px] text-text-muted">
        <Kbd>Esc</Kbd> 退出紧凑模式
      </span>
    </div>
  )
}

function DividerDemo() {
  return (
    <div className="flex items-center gap-3 text-[12px] text-text-secondary">
      <span>已保存</span>
      <Divider className="h-4 w-px self-stretch border-t-0 border-l" />
      <span>本机存储</span>
      <Divider className="h-4 w-px self-stretch border-t-0 border-l" />
      <span>v0.4</span>
    </div>
  )
}

/* ── Field ── */

function FieldBasicDemo() {
  return (
    <div className="grid max-w-[620px] gap-3.5">
      <TextField label="准备名称" placeholder="例如:字节跳动 · 技术二面" hint="保存准备后,可从列表进入面试。" />
      <TextField label="生成温度" type="number" min={0} max={2} step={0.1} defaultValue="0.7" />
      <TextField placeholder="搜索公司、岗位或问题…" aria-label="搜索记录" prefix={<MagnifyingGlass />} />
    </div>
  )
}

function FieldLayoutDemo() {
  return (
    <div className="grid max-w-[620px] gap-3.5">
      <FieldRow>
        <TextField label="双列左" placeholder="FieldRow" />
        <TextField label="双列右" placeholder="FieldRow" />
      </FieldRow>
      <TextareaField label="问题" rows={3} placeholder="输入问题,或从左侧加入多段转写…" hint="句末静音控制转写分句。" />
    </div>
  )
}

function FieldErrorDemo() {
  const [name, setName] = useState('')
  return (
    <div className="grid max-w-[620px] gap-3.5">
      <TextField
        label="准备名称"
        required
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        error={name.trim() ? undefined : '名称不能为空'}
        hint="保存准备后,可从列表进入面试。"
      />
      <TextareaField label="问题" error="至少输入一个字" />
    </div>
  )
}

/* ── AppSelect ── */

function SelectGroupDemo() {
  return (
    <div className="max-w-[320px]">
      <AppSelect
        aria-label="回答模型"
        defaultValue="deepseek"
        options={[
          { value: 'deepseek', label: 'DeepSeek Chat' },
          { value: 'gpt', label: 'GPT-4o mini', group: 'OpenAI' },
          { value: 'gpt-large', label: 'GPT-4o', group: 'OpenAI' },
          { value: 'claude', label: 'Claude Sonnet', group: 'Anthropic' },
        ]}
        newItem={{ value: '__custom__', label: '自定义模型…' }}
      />
    </div>
  )
}

function SelectSmDemo() {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="flex w-[220px] flex-col gap-1.5">
        <span className="text-[12.5px] text-text-secondary">lg 页面级规格</span>
        <AppSelect
          size="lg"
          aria-label="面试环境"
          defaultValue="default"
          options={[
            { value: 'default', label: '默认环境' },
            { value: 'backend', label: '后端 · 字节跳动' },
          ]}
        />
      </div>
      <div className="flex w-[220px] flex-col gap-1.5">
        <span className="text-[12.5px] text-text-secondary">sm 行内规格(资料用途)</span>
        <AppSelect
          size="sm"
          aria-label="资料用途"
          defaultValue="technical"
          options={[
            { value: 'technical', label: '技术参考' },
            { value: 'personal', label: '我的项目经历' },
          ]}
        />
      </div>
      <div className="flex w-[220px] flex-col gap-1.5">
        <span className="text-[12.5px] text-text-secondary">禁用态</span>
        <AppSelect size="sm" disabled aria-label="禁用态" options={[{ value: 'x', label: '不可用' }]} />
      </div>
    </div>
  )
}

/* ── CheckRow / ChoiceRow ── */

function CheckRowDemo() {
  const [includeResume, setIncludeResume] = useState(true)
  return (
    <div className="flex flex-col">
      <CheckRow label="自动包含简历" checked={includeResume} onChange={setIncludeResume} />
      <CheckRow label="句末静音分句" defaultChecked />
      <CheckRow label="已禁用项" disabled />
    </div>
  )
}

function ChoiceRowDemo() {
  return (
    <div className="flex w-[300px] flex-col">
      <ChoiceRow name="kb-source" value="local" defaultChecked label="本地知识库" description="默认" />
      <ChoiceRow name="kb-source" value="remote" label="远程知识库" description="需登录" />
      <ChoiceRow name="kb-source" value="none" label="不使用知识库" disabled />
    </div>
  )
}

/* ── TabBar ── */

function TabsDemo() {
  const [tab, setTab] = useState('resume')
  return (
    <div className="max-w-[560px]">
      <TabBar
        value={tab}
        onValueChange={setTab}
        aria-label="资料库"
        items={[
          { value: 'resume', label: '我的简历', count: '02' },
          { value: 'target', label: '目标岗位', count: '02' },
          { value: 'reference', label: '参考资料', count: '04' },
        ]}
      />
      <p className="text-[12px] text-text-secondary">
        当前面板:<span className="font-medium text-text-primary">{tab}</span>(面板内容由调用方按 value 切换)
      </p>
    </div>
  )
}

/* ── LevelMeter ── */

function MeterLiveDemo() {
  const [level, setLevel] = useState(0.35)
  useEffect(() => {
    const timer = setInterval(() => {
      setLevel((prev) => Math.min(1, Math.max(0.05, prev + (Math.random() - 0.5) * 0.28)))
    }, 120)
    return () => clearInterval(timer)
  }, [])
  return (
    <div className="flex items-center gap-4">
      <LevelMeter level={level} />
      <span className="font-mono text-[11px] text-text-muted">{Math.round(level * 100)}%</span>
    </div>
  )
}

function MeterStaticDemo() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <LevelMeter level={0} />
      <LevelMeter level={0.5} />
      <LevelMeter level={1} />
    </div>
  )
}

/* ── Avatar ── */

function AvatarDemo() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar name="林序" />
      <Avatar name="Lin Xu" />
      <Avatar name="林序" src="https://api.dicebear.com/9.x/initials/svg?seed=Lin+Xu&backgroundColor=dde9ff" size={40} />
    </div>
  )
}

/* ── EmptyState ── */

function EmptyStateDemo() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-control border border-border bg-card">
        <EmptyState
          icon={<Waveform />}
          title="等待开始聆听"
          description="点击上方「开始转写」,面试对话会实时出现在这里;当前问题以浅蓝底标出。"
        />
      </div>
      <div className="rounded-control border border-border bg-card">
        <EmptyState tone="success" icon={<Sparkle />} title="等待第一道问题">
          <span className="text-[10.5px] text-text-muted">回答将参考</span>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Pill><FileText />后端开发简历</Pill>
            <Pill><Briefcase />字节跳动</Pill>
          </div>
        </EmptyState>
      </div>
    </div>
  )
}

/* ── Skeleton ── */

function SkeletonDemo() {
  return (
    <div className="flex max-w-[420px] flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  )
}

/* ── Table ── */

function TableDemo() {
  return (
    <div className="max-w-[620px] overflow-hidden rounded-control border border-border bg-card shadow-card">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>面试 / 会话</TableHeader>
            <TableHeader>时间</TableHeader>
            <TableHeader>问答</TableHeader>
            <TableHeader className="text-right">操作</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>
              <div className="font-semibold text-text-primary">字节跳动 · 技术二面</div>
              <div className="text-[11.5px] text-text-secondary">技术二面 · Redis 缓存一致性问题…</div>
            </TableCell>
            <TableCell>刚刚</TableCell>
            <TableCell>3 个回答</TableCell>
            <TableCell className="text-right"><LinkButton>查看<ArrowUpRight /></LinkButton></TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              <div className="font-semibold text-text-primary">腾讯 · 技术一面</div>
              <div className="text-[11.5px] text-text-secondary">技术一面 · 慢查询排查…</div>
            </TableCell>
            <TableCell>昨天</TableCell>
            <TableCell>5 个回答</TableCell>
            <TableCell className="text-right"><LinkButton>查看<ArrowUpRight /></LinkButton></TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}

/* ── Modal ── */

function DialogDemo() {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" onClick={() => setOpen(true)}>打开示例弹窗</Button>
      <span className="text-[11px] text-text-muted">Esc / 点击遮罩 / 右上角 X 均可关闭</span>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="开始新会话"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>开始新会话</Button>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-text-secondary">
          当前转写与回答会先存入面试记录。选择本场要使用的面试准备。
        </p>
      </Modal>
    </div>
  )
}

/* ── ConfirmModal ── */

function ConfirmDemo() {
  const [open, setOpen] = useState(false)
  const [removed, setRemoved] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" size="xs" className={buttonDangerClass} onClick={() => setOpen(true)} disabled={removed}>
        <Trash />移除资料
      </Button>
      {removed && <span className="text-[11px] text-text-muted">已移除</span>}
      <ConfirmModal
        open={open}
        onOpenChange={setOpen}
        title="移除这份资料?"
        description="移除后需重新上传并构建索引,历史回答不受影响。"
        confirmText="移除"
        danger
        onConfirm={() => setRemoved(true)}
      />
    </div>
  )
}

/* ── Toast ── */

function ToastDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => toast.show('已保存设置')}>info 提示</Button>
      <Button onClick={() => toast.show('索引构建完成,可以开始检索', { type: 'success' })}>success 提示</Button>
      <Button onClick={() => toast.show('保存失败,请重试', { type: 'error' })}>error 提示</Button>
    </div>
  )
}

function ToastActionDemo() {
  const [removed, setRemoved] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant={removed ? 'outline' : 'primary'}
        onClick={() => {
          setRemoved(true)
          toast.show('已移除资料「后端开发简历.md」', {
            type: 'success',
            action: { label: '撤销', onClick: () => setRemoved(false) },
          })
        }}
        disabled={removed}
      >
        移除资料
      </Button>
      <Button
        onClick={() => {
          const id = toast.show('索引构建中…', { duration: 0 })
          setTimeout(() => toast.dismiss(id), 2400)
        }}
      >
        常驻提示(2.4s 后手动关)
      </Button>
      {removed && <span className="text-[11px] text-text-muted">已移除,点 toast 里的「撤销」恢复</span>}
    </div>
  )
}

/* ── Collapse ── */

function CollapseDemo() {
  return (
    <div className="max-w-[560px]">
      <Collapse summary="本次检索资料(3 段,共 1,240 字)">
        {`【简历 · 摘要】五年后端经验,主导过亿级日请求网关重构……\n【职位描述 · 节选】负责核心交易链路的稳定性与容量规划……\n【常见问答 · 命中】Q:分布式幂等怎么做? A:唯一键 + 状态机……`}
      </Collapse>
      <Collapse summary="本次发送内容(412 tokens)" defaultOpen>
        {`系统提示词(146 tokens)+ 问题(88 tokens)+ 检索片段(178 tokens)`}
      </Collapse>
    </div>
  )
}

/* ── 设计令牌页:运行时读 getComputedStyle,与 tokens.css 永远同步 ── */

const COLOR_GROUPS: Array<{ label: string; names: string[] }> = [
  { label: '面', names: ['page', 'canvas', 'card', 'subtle'] },
  { label: '线', names: ['border', 'border-strong', 'border-hover', 'border-dashed', 'border-selected'] },
  { label: '品牌蓝', names: ['accent', 'accent-hover', 'accent-active', 'accent-text', 'accent-subtle', 'accent-line'] },
  { label: '副色', names: ['violet', 'success', 'success-subtle', 'success-line', 'danger', 'danger-subtle', 'danger-line'] },
  { label: '文字', names: ['text-primary', 'text-heading', 'text-regular', 'text-secondary', 'text-muted', 'text-on-fill'] },
  { label: '杂项面', names: ['overlay', 'led-idle', 'track-idle', 'scrim'] },
]

const RADII = ['radius-card', 'radius-control', 'radius-chip']
const SHADOWS = ['shadow-card', 'shadow-pop', 'shadow-focus-ring']

function useTokenValue(token: string): string {
  const [value, setValue] = useState('')
  useEffect(() => {
    setValue(getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim())
  }, [token])
  return value
}

function ColorSwatch({ name }: { name: string }) {
  const value = useTokenValue(`color-${name}`)
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="size-9 shrink-0 rounded-control border border-border"
        style={{ background: `var(--color-${name})` }}
      />
      <div className="min-w-0">
        <div className="font-mono text-[11px] leading-4 text-text-primary">--color-{name}</div>
        <div className="font-mono text-[10.5px] leading-4 text-text-muted">{value || '—'}</div>
      </div>
    </div>
  )
}

function TokenDemo() {
  return (
    <div className="flex flex-col gap-6">
      {COLOR_GROUPS.map((group) => (
        <div key={group.label}>
          <Eyebrow>{group.label}</Eyebrow>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {group.names.map((name) => (
              <ColorSwatch key={name} name={name} />
            ))}
          </div>
        </div>
      ))}
      <div>
        <Eyebrow>圆角</Eyebrow>
        <div className="flex flex-wrap gap-4">
          {RADII.map((token) => (
            <div key={token} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-12 border border-border bg-card"
                style={{ borderRadius: `var(--${token})` }}
              />
              <span className="font-mono text-[11px] text-text-primary">--{token}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <Eyebrow>阴影</Eyebrow>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {SHADOWS.map((token) => (
            <div key={token} className="flex flex-col items-start gap-2">
              <span aria-hidden className="h-12 w-full rounded-card bg-card" style={{ boxShadow: `var(--${token})` }} />
              <span className="font-mono text-[11px] text-text-primary">--{token}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── 注册表:label 与 registry.ts examples 一一对应 ── */

function SliderDemo() {
  const [value, setValue] = useState(20)
  const [saved, setSaved] = useState(20)
  return <div className="w-full space-y-2"><p>背景不透明度 {value}% · 已保存 {saved}%</p><Slider value={value} max={80} onValueChange={setValue} onValueCommit={setSaved} aria-label="背景不透明度" /></div>
}

export const demoExamples: Record<string, Array<{ label: string; component: ComponentType }>> = {
  slider: [{ label: '背景不透明度', component: SliderDemo }],
  button: [
    { label: '基础变体', component: ButtonVariantsDemo },
    { label: '尺寸', component: ButtonSizesDemo },
    { label: '图标与危险态', component: ButtonMiscDemo },
    { label: '加载态', component: ButtonLoadingDemo },
  ],
  pill: [
    { label: '信息胶囊', component: PillInfoDemo },
    { label: '状态章四态', component: PillStatusDemo },
    { label: 'Eyebrow 区块标签', component: PillEyebrowDemo },
  ],
  switch: [
    { label: '双规格与受控', component: SwitchSizesDemo },
    { label: '禁用态', component: SwitchDisabledDemo },
  ],
  segmented: [{ label: '音源切换', component: SegmentedSourceDemo }],
  tooltip: [{ label: '包裹任意元素', component: TooltipDemo }],
  menu: [
    { label: '动作收纳', component: MenuDemo },
    { label: '⋯ 触发与勾选态', component: MenuIconDemo },
  ],
  badge: [{ label: '计数', component: BadgeDemo }],
  kbd: [{ label: '按钮内快捷键', component: KbdDemo }],
  divider: [{ label: '区块分隔', component: DividerDemo }],
  field: [
    { label: '基础', component: FieldBasicDemo },
    { label: '双列与多行', component: FieldLayoutDemo },
    { label: '校验态', component: FieldErrorDemo },
  ],
  select: [
    { label: '分组与自定义入口', component: SelectGroupDemo },
    { label: 'sm 行内与禁用', component: SelectSmDemo },
  ],
  'check-row': [
    { label: '勾选行', component: CheckRowDemo },
    { label: '来源选择卡片', component: ChoiceRowDemo },
  ],
  tabs: [{ label: '资料库页签', component: TabsDemo }],
  meter: [
    { label: '动态电平(演示)', component: MeterLiveDemo },
    { label: '静态刻度', component: MeterStaticDemo },
  ],
  avatar: [{ label: '首字母与图片', component: AvatarDemo }],
  'empty-state': [{ label: '双色调', component: EmptyStateDemo }],
  skeleton: [{ label: '加载占位', component: SkeletonDemo }],
  table: [{ label: '记录表', component: TableDemo }],
  dialog: [
    { label: '基础弹窗', component: DialogDemo },
    { label: '确认弹窗', component: ConfirmDemo },
  ],
  toast: [
    { label: '三种类型', component: ToastDemo },
    { label: '动作与常驻', component: ToastActionDemo },
  ],
  collapsible: [{ label: '检索详情折叠', component: CollapseDemo }],
  token: [{ label: '全量令牌', component: TokenDemo }],
}
