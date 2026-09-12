/*
 * 组件注册表 —— 纯数据,不掺壳逻辑。
 * 定位:未来沉淀组件库时的文档种子(props 表 / 用法片段即此处的单一来源)。
 * 约束:props 必须与 src/renderer/src/components/ui 的 interface 同步
 * (tests/ui/registry-drift.test.ts 用 TS AST 反向比对,漏记即红;通用透传
 * ref/className/children/id/aria-label 允许不单列)。
 */

export interface PropRow {
  name: string
  type: string
  def?: string
  note: string
}

export interface ExampleDoc {
  label: string
  code: string
}

export interface ComponentDoc {
  id: string
  name: string
  title: string
  group: string
  description: string
  props: PropRow[]
  /** 多示例:label 需与 demos.tsx 中 demoExamples[id] 的 label 一一对应(漂移测试钉死) */
  examples: ExampleDoc[]
}

export const GROUPS = ['通用', '表单', '展示', '反馈'] as const

export const componentDocs: ComponentDoc[] = [
  {
    id: 'button',
    name: 'Button',
    title: '按钮族',
    group: '通用',
    description: '动作触发:default / primary / quiet / outline × md(36) / sm(32) / xs(30),含 IconButton、LinkButton、TextButton 与危险态类(spec §2)。全员透传 ref。',
    props: [
      { name: 'variant', type: "'default' | 'primary' | 'quiet' | 'outline'", def: "'default'", note: 'primary = 蓝实底白字;outline 配合行内小按钮与危险态' },
      { name: 'size', type: "'md' | 'sm' | 'xs'", def: "'md'", note: 'md 表单主操作 / sm 输入框内 / xs 行内(转写、资料行操作)' },
      { name: 'loading', type: 'boolean', note: '进行中:行首转圈图标 + 自动禁用 + aria-busy(生成回答/重建索引)' },
      { name: 'className', type: 'string', note: '追加类;危险态拼 buttonDangerClass' },
      { name: '…原生', type: 'ButtonHTMLAttributes', note: 'onClick / disabled / type(默认 button)等' },
    ],
    examples: [
      {
        label: '基础变体',
        code: `<Button>导入资料</Button>
<Button variant="primary">保存设置</Button>
<Button variant="quiet">取消</Button>
<Button variant="outline">加入问题</Button>`,
      },
      {
        label: '尺寸',
        code: `<Button variant="primary" size="sm">生成回答</Button>
<Button variant="outline" size="xs">回答这句</Button>
<Button variant="primary" size="xs">回答这句</Button>`,
      },
      {
        label: '图标与危险态',
        code: `<Button variant="quiet"><Plus />新会话</Button>
<IconButton aria-label="置顶"><CheckCircle /></IconButton>
<LinkButton>查看回答<ArrowUpRight /></LinkButton>
<TextButton>退出登录</TextButton>
<Button variant="outline" size="xs" className={buttonDangerClass}>
  <Trash />移除
</Button>
<Button variant="outline" size="xs" disabled>
  <ArrowClockwise />重建索引
</Button>`,
      },
      {
        label: '加载态',
        code: `<Button variant="primary" loading={generating} onClick={generate}>
  {generating ? '生成中…' : '生成回答'}
</Button>
<Button variant="outline" loading>重建索引</Button>`,
      },
    ],
  },
  {
    id: 'pill',
    name: 'Pill · StatusPill',
    title: '胶囊与状态章',
    group: '通用',
    description: '信息胶囊(10.5/500 subtle 底)与参考资料四态状态章:pending 灰 / busy 蓝 / ready 绿 / error 红,内置呼吸点(spec §6.1)。',
    props: [
      { name: 'Pill', type: 'HTMLAttributes<HTMLSpanElement>', note: '纯展示胶囊,内容自填(Dot / 图标 / 文本)' },
      { name: 'StatusPill.status', type: "'pending' | 'busy' | 'ready' | 'error'", note: '必填;决定配色与状态点呼吸' },
      { name: 'Dot.tone', type: "'success' | 'accent' | 'danger' | 'muted'", def: "'success'", note: '6px 状态点颜色' },
      { name: 'Dot.pulse', type: 'boolean', def: 'true', note: '1.6s 呼吸动画' },
      { name: 'Eyebrow', type: 'children', note: 'mono 小标签(10/700 大写,accent 文字),区块标题用' },
    ],
    examples: [
      {
        label: '信息胶囊',
        code: `<Pill><Dot />当前使用</Pill>
<Pill>技术二面</Pill>
<Pill><UploadSimple />3 份参考资料</Pill>`,
      },
      {
        label: '状态章四态',
        code: `<StatusPill status="ready">可用</StatusPill>
<StatusPill status="busy">建索引中</StatusPill>
<StatusPill status="pending">等待建索引</StatusPill>
<StatusPill status="error">处理失败</StatusPill>`,
      },
      {
        label: 'Eyebrow 区块标签',
        code: `<Eyebrow>SECTION LABEL</Eyebrow>`,
      },
    ],
  },
  {
    id: 'switch',
    name: 'ToggleSwitch',
    title: '开关',
    group: '通用',
    description: '双规格开关:md 44×24(设置表单)/ sm 32×18(工作台胶囊栏)；选中态 accent 实底，滑块位移过渡(spec §2)。ref 指向 span[role=switch]。',
    props: [
      { name: 'checked / defaultChecked', type: 'boolean', note: '受控 / 非受控' },
      { name: 'onCheckedChange', type: '(checked: boolean) => void', note: '单参回调(Base UI eventDetails 已剥离)' },
      { name: 'size', type: "'md' | 'sm'", def: "'md'", note: 'sm 用于胶囊栏"自动回答"' },
      { name: 'label', type: 'ReactNode', note: '开关旁说明文字,整体可点' },
      { name: 'description', type: 'ReactNode', note: 'label 下副文案(设置项两行说明);仅传 label 时生效' },
      { name: 'disabled', type: 'boolean', note: '半透明 + 禁点' },
    ],
    examples: [
      {
        label: '双规格与受控',
        code: `<ToggleSwitch checked={auto} onCheckedChange={setAuto} label="自动回答" size="sm" />
<ToggleSwitch
  checked={retrieval}
  onCheckedChange={setRetrieval}
  label="使用参考资料"
  description="回答前从简历、岗位与参考资料中检索相关片段"
/>`,
      },
      {
        label: '禁用态',
        code: `<ToggleSwitch defaultChecked={false} disabled label="系统音频自动回答" />`,
      },
    ],
  },
  {
    id: 'segmented',
    name: 'Segmented',
    title: '分段单选',
    group: '通用',
    description: '分段控件(音源切换等)：subtle 底容器，选中项白底 + 浅蓝边 + accent 文字(spec §2)。受控专用，调用方持有 value。',
    props: [
      { name: 'value', type: 'string', note: '受控选中值(必传)' },
      { name: 'onValueChange', type: '(value: string) => void', note: '切换回调' },
      { name: 'options', type: '{ value: string; label: string; icon?: ReactNode }[]', note: '选项,icon 可选(13px)' },
      { name: 'disabled', type: 'boolean', note: '整组禁用(如转写进行中锁定音源)' },
      { name: 'aria-label', type: 'string', note: '无障碍命名,必填语义' },
    ],
    examples: [
      {
        label: '音源切换',
        code: `<Segmented
  value={source}
  onValueChange={setSource}
  aria-label="音源"
  options={[
    { value: 'system', label: '系统音频', icon: <Monitor /> },
    { value: 'mic', label: '麦克风', icon: <Microphone /> },
  ]}
/>`,
      },
    ],
  },
  {
    id: 'tooltip',
    name: 'Tooltip',
    title: '悬停提示',
    group: '通用',
    description: '悬停/聚焦提示(基建外推 2026-09-11,设计稿未画)：深底白字、radius-chip,悬停 600ms / 键盘聚焦即出。children 为触发元素，经 render 合并不包额外 button;替代原生 title。',
    props: [
      { name: 'content', type: 'ReactNode', note: '提示内容' },
      { name: 'children', type: 'ReactElement', note: '触发元素(单个),样式与语义原样保留' },
      { name: 'side', type: "'top' | 'bottom' | 'left' | 'right'", def: "'top'", note: '相对触发元素的方位' },
      { name: 'align', type: "'start' | 'center' | 'end'", def: "'center'", note: '对齐方式' },
    ],
    examples: [
      {
        label: '包裹任意元素',
        code: `<Tooltip content="置顶预览窗">
  <IconButton aria-label="置顶"><PushPin /></IconButton>
</Tooltip>
<Tooltip content="回答模型 · 点击在设置中修改" side="bottom">
  <Button variant="quiet">DeepSeek V3</Button>
</Tooltip>`,
      },
    ],
  },
  {
    id: 'menu',
    name: 'DropdownMenu',
    title: '下拉菜单',
    group: '通用',
    description: '动作收纳菜单(基建外推 2026-09-11):Base UI Menu,键盘 ↑↓/Home/End/字符匹配导航，Esc/外点关闭；高亮态 data-highlighted。用于资料行/转写条等高密度操作的二级收纳。',
    props: [
      { name: 'trigger', type: 'ReactNode', note: '触发器内容(默认 Button 样式 + 自动尾箭头);iconTrigger 时忽略' },
      { name: 'iconTrigger', type: 'boolean', note: '36×36「⋯」图标钮触发(资料行等高密度行);此时 aria-label 必给' },
      { name: 'items', type: 'MenuEntry[]', note: "条目:{value,label,icon?,danger?,disabled?,checked?} / {kind:'divider'} / {kind:'label'};checked=行首 ✓(排序/视图类)" },
      { name: 'onValueChange', type: '(value: string) => void', note: '点击 item 回调其 value,菜单自动关闭' },
      { name: 'align', type: "'start' | 'center' | 'end'", def: "'start'", note: '菜单相对触发器对齐' },
    ],
    examples: [
      {
        label: '动作收纳',
        code: `<DropdownMenu
  trigger="更多操作"
  onValueChange={onAction}
  items={[
    { kind: 'label', label: '资料操作' },
    { value: 'preview', label: '预览', icon: <Eye /> },
    { value: 'reindex', label: '重建索引', icon: <ArrowClockwise />, disabled: true },
    { kind: 'divider' },
    { value: 'remove', label: '移除', icon: <Trash />, danger: true },
  ]}
/>`,
      },
      {
        label: '⋯ 触发与勾选态',
        code: `<DropdownMenu
  iconTrigger
  aria-label="排序方式"
  onValueChange={setSort}
  items={[
    { value: 'recent', label: '最近使用', checked: sort === 'recent' },
    { value: 'name', label: '名称', checked: sort === 'name' },
    { kind: 'divider' },
    { value: 'remove', label: '移除', danger: true },
  ]}
/>`,
      },
    ],
  },
  {
    id: 'badge',
    name: 'Badge',
    title: '徽标',
    group: '通用',
    description: '计数/短状态徽标(§6 tab 计数风格化)：mono 10.5px、subtle 底 + 边、圆角 chip。纯展示，语义由调用方给 aria。',
    props: [{ name: '…原生', type: 'HTMLAttributes<HTMLSpanElement>', note: '内容自填,常为数字' }],
    examples: [
      {
        label: '计数',
        code: `<Badge>02</Badge>
<Badge>04</Badge>
<Badge>99+</Badge>`,
      },
    ],
  },
  {
    id: 'kbd',
    name: 'Kbd',
    title: '快捷键',
    group: '通用',
    description: '键盘按键展示(spec §4.4 composer「⌘ ↵」)：mono 10px、60% 不透明度；设计即素字，不加边框。',
    props: [{ name: 'children', type: 'ReactNode', note: '按键文本,如 "⌘ ↵"' }],
    examples: [
      {
        label: '按钮内快捷键',
        code: `<Button variant="primary" size="sm">
  生成回答<ArrowUp /><Kbd>⌘ ↵</Kbd>
</Button>
<Kbd>Esc</Kbd> 退出紧凑模式`,
      },
    ],
  },
  {
    id: 'divider',
    name: 'Divider',
    title: '分隔线',
    group: '通用',
    description: '水平分隔线：1px border 色、语义化 <hr>;垂直场景在 flex 容器内用 className 覆写。',
    props: [{ name: 'className', type: 'string', note: '覆写走向/间距(如 w-px self-stretch)' }],
    examples: [
      {
        label: '区块分隔',
        code: `<div className="flex items-center gap-3">
  <span>已保存</span>
  <Divider className="h-4 w-px self-stretch border-t-0 border-l" />
  <span>本机存储</span>
</div>`,
      },
    ],
  },
  {
    id: 'field',
    name: 'TextField · TextareaField',
    title: '表单输入',
    group: '表单',
    description: '纵排 label(12.5/500)+ 控件 + hint;控件 1px border-strong、radius-chip,聚焦 = accent 边 + 3px 光环(spec §2)。error 校验态(2026-09-11 增补)：红边 + aria-invalid + 文案取代 hint;required 时 label 尾红星。FieldRow 为双列容器。',
    props: [
      { name: 'label', type: 'ReactNode', note: '省略则不渲染标签' },
      { name: 'hint', type: 'ReactNode', note: '控件下方固定说明(11px)' },
      { name: 'error', type: 'ReactNode', note: '校验错误:红边 + aria-invalid,显示时取代 hint' },
      { name: 'prefix / suffix', type: 'ReactNode', note: '控件内前置/后置图标(搜索框放大镜等),仅 TextField;传入后自动让出对应内边距' },
      { name: 'id', type: 'string', note: '传则建立 label↔控件关联' },
      { name: '…原生', type: 'InputHTMLAttributes / TextareaHTMLAttributes', note: 'type / rows / placeholder / required / disabled 等' },
      { name: 'controlClassName', type: 'string', note: '仅 TextareaField,覆盖控件样式' },
    ],
    examples: [
      {
        label: '基础',
        code: `<TextField
  label="准备名称"
  placeholder="例如:字节跳动 · 技术二面"
  hint="保存准备后,可从列表进入面试。"
/>
<TextField label="生成温度" type="number" min={0} max={2} step={0.1} defaultValue="0.7" />
<TextField
  placeholder="搜索公司、岗位或问题…"
  aria-label="搜索记录"
  prefix={<MagnifyingGlass />}
/>`,
      },
      {
        label: '双列与多行',
        code: `<FieldRow>
  <TextField label="左列" />
  <TextField label="右列" />
</FieldRow>
<TextareaField label="问题" rows={3} hint="句末静音控制转写分句。" />`,
      },
      {
        label: '校验态',
        code: `<TextField
  label="准备名称"
  required
  value=""
  error="名称不能为空"
/>
<TextareaField label="问题" error="至少输入一个字" />`,
      },
    ],
  },
  {
    id: 'select',
    name: 'AppSelect',
    title: '选择器',
    group: '表单',
    description: '表单选择器：Trigger 沿用输入框外观，分组下拉 + 可选“+ 自定义”入口；sm 行内规格用于资料行；选中态不带勾选符，贴合原生观感(spec §5/§8.1)。',
    props: [
      { name: 'value / defaultValue', type: 'string | null', note: '受控 / 非受控；value 传 null 显示占位符(服务选择空态)' },
      { name: 'onValueChange', type: '(value: string) => void', note: '单参回调' },
      { name: 'options', type: '{ value: string; label: string; group?: string; disabled?: boolean }[]', note: 'group 相同者归组渲染；disabled 为不可选占位项' },
      { name: 'newItem', type: '{ value: string; label: string }', note: '尾部分隔线 + “+ 自定义…”入口' },
      { name: 'size', type: "'lg' | 'md' | 'sm'", def: "'md'", note: 'lg = 页面级主选择器；sm = 11.5px 行内规格' },
      { name: 'placeholder', type: 'string', def: "'请选择'", note: '空值占位' },
      { name: 'disabled', type: 'boolean', note: '禁用整只选择器' },
      { name: 'aria-invalid', type: 'boolean', note: '校验失败标记：红边 + aria-invalid(引用失效场景)' },
      { name: 'aria-describedby', type: 'string', note: '指向 Trigger 的说明/告警段落(服务选择)' },
    ],
    examples: [
      {
        label: '分组与自定义入口',
        code: `<AppSelect
  aria-label="回答模型"
  defaultValue="deepseek"
  options={[
    { value: 'deepseek', label: 'DeepSeek Chat' },
    { value: 'gpt', label: 'GPT-4o mini', group: 'OpenAI' },
    { value: 'claude', label: 'Claude Sonnet', group: 'Anthropic' },
  ]}
  newItem={{ value: '__custom__', label: '自定义模型…' }}
/>`,
      },
      {
        label: 'sm 行内与禁用',
        code: `<AppSelect size="sm" aria-label="资料用途" options={kindOptions} />
<AppSelect size="sm" disabled aria-label="禁用" options={…} />`,
      },
    ],
  },
  {
    id: 'check-row',
    name: 'CheckRow · ChoiceRow',
    title: '勾选与来源选择',
    group: '表单',
    description: '原生 input + accent-color(设计即原生观感)：CheckRow 普通勾选行;ChoiceRow 卡片式来源选择，:has(:checked) 时蓝边浅蓝底；radio 同 name 天然成组(spec §5/§8.1)。ref 指向内部 input。',
    props: [
      { name: 'label', type: 'ReactNode', note: '行文字' },
      { name: 'checked / defaultChecked', type: 'boolean', note: '受控 / 非受控' },
      { name: 'onChange', type: '(checked: boolean) => void', note: '单参回调' },
      { name: 'ChoiceRow.description', type: 'ReactNode', note: '行尾辅助说明(11.5px muted)' },
      { name: 'ChoiceRow.type', type: "'radio' | 'checkbox'", def: "'radio'", note: 'ChoiceRow 可作多选卡片' },
      { name: 'name / value', type: 'string', note: 'radio 分组靠同名 name' },
      { name: 'disabled', type: 'boolean', note: '禁用该行' },
    ],
    examples: [
      {
        label: '勾选行',
        code: `<CheckRow label="自动包含简历" checked={inc} onChange={setInc} />
<CheckRow label="句末静音分句" defaultChecked />
<CheckRow label="已禁用项" disabled />`,
      },
      {
        label: '来源选择卡片',
        code: `<ChoiceRow name="kb-source" value="local" defaultChecked label="本地知识库" description="默认" />
<ChoiceRow name="kb-source" value="remote" label="远程知识库" description="需登录" />
<ChoiceRow name="kb-source" value="none" label="不使用知识库" disabled />`,
      },
    ],
  },
  {
    id: 'tabs',
    name: 'TabBar',
    title: '页签',
    group: '展示',
    description: '下划线式页签(资料库等)：激活 = text-primary + 600 字重 + 3px accent 圆头下划线；仅渲染页签栏，面板内容由调用方按 value 切换(spec §6)。',
    props: [
      { name: 'items', type: '{ value: string; label: string; count?: ReactNode; id?: string }[]', note: '页签项;count = 尾部 muted 计数(§6「我的简历 02」,调用方格式化);id 透传到按钮供自定义面板 aria-labelledby 关联' },
      { name: 'value', type: 'string', note: '受控当前页签' },
      { name: 'onValueChange', type: '(value: string) => void', note: '切换回调' },
      { name: 'aria-label', type: 'string', note: '页签栏命名' },
    ],
    examples: [
      {
        label: '资料库页签',
        code: `<TabBar
  value={tab}
  onValueChange={setTab}
  aria-label="资料库"
  items={[
    { value: 'resume', label: '我的简历' },
    { value: 'target', label: '目标岗位' },
    { value: 'reference', label: '参考资料' },
  ]}
/>`,
      },
    ],
  },
  {
    id: 'meter',
    name: 'LevelMeter',
    title: '输入电平条',
    group: '展示',
    description: '14 格 LED 电平条：2.5×10px 圆头，亮格 success / 灭格 led-idle,150ms 变色；level 0~1 由录音 RMS 驱动，组件自身不计时(spec §2)。',
    props: [
      { name: 'level', type: 'number', def: '0', note: '0~1,越界自动钳制;14 格取整点亮' },
      { name: 'aria-label', type: 'string', def: "'输入音量'", note: 'role=meter 的无障碍命名' },
    ],
    examples: [
      {
        label: '动态电平(演示)',
        code: `<LevelMeter level={session.level} aria-label="输入音量" />`,
      },
      {
        label: '静态刻度',
        code: `<LevelMeter level={0} />
<LevelMeter level={0.5} />
<LevelMeter level={1} />`,
      },
    ],
  },
  {
    id: 'avatar',
    name: 'Avatar',
    title: '头像',
    group: '展示',
    description: '圆形头像(spec §3.1 profile):浅蓝底 + accent 首字母(拉丁名取前两词首字母大写，中文名取首字)；提供 src 时渲染图片。',
    props: [
      { name: 'name', type: 'string', note: '显示名,用于生成兜底首字母' },
      { name: 'src', type: 'string', note: '图片地址,提供则优先渲染' },
      { name: 'size', type: 'number', def: '31', note: '直径 px' },
    ],
    examples: [
      {
        label: '首字母与图片',
        code: `<Avatar name="林序" />
<Avatar name="Lin Xu" />
<Avatar name="林序" src={user.avatarUrl} size={40} />`,
      },
    ],
  },
  {
    id: 'empty-state',
    name: 'EmptyState',
    title: '空态',
    group: '展示',
    description: '空态块(spec §4.5 双面板)：44px 圆角瓷片 + 标题(14.5/600)+ 说明，纵排居中；accent 蓝瓷片(默认)/ success 绿瓷片(回答侧)；children 放附加内容(如“回答将参考”胶囊组)。',
    props: [
      { name: 'icon', type: 'ReactNode', note: '瓷片图标(22px)' },
      { name: 'title', type: 'ReactNode', note: '标题文字' },
      { name: 'description', type: 'ReactNode', note: '说明文字(可换行)' },
      { name: 'tone', type: "'accent' | 'success'", def: "'accent'", note: '瓷片色调' },
      { name: 'children', type: 'ReactNode', note: '尾部附加区' },
    ],
    examples: [
      {
        label: '双色调',
        code: `<EmptyState
  icon={<Waveform />}
  title="等待开始聆听"
  description="点击上方「开始转写」,面试对话会实时出现在这里。"
/>
<EmptyState tone="success" icon={<Sparkle />} title="等待第一道问题">
  <div className="flex gap-2">
    <Pill><FileText />后端开发简历</Pill>
    <Pill><Briefcase />字节跳动</Pill>
  </div>
</EmptyState>`,
      },
    ],
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    title: '骨架屏',
    group: '展示',
    description: '加载占位(基建外推 2026-09-11):border 色灰块 + 1.6s 呼吸(复用 Dot 脉冲令牌)；尺寸形状由 className 决定，装饰性(aria-hidden)。',
    props: [{ name: 'className', type: 'string', note: '定形:h-4 w-2/3 / size-9 rounded-full 等' }],
    examples: [
      {
        label: '加载占位',
        code: `<div className="flex items-center gap-3">
  <Skeleton className="size-9 rounded-full" />
  <div className="flex flex-col gap-2">
    <Skeleton className="h-3.5 w-32" />
    <Skeleton className="h-3 w-20" />
  </div>
</div>`,
      },
    ],
  },
  {
    id: 'table',
    name: 'Table',
    title: '表格基元',
    group: '展示',
    description: '表格结构基元(spec §7 记录表)：表头 subtle 底 11px muted、行下边框分隔 + hover、单元格默认内边距可覆写。只管样式，数据组织/空态由调用方负责。',
    props: [
      { name: 'Table / TableHead / TableBody', type: '原生 table 元素 props', note: '结构容器,Head 自带 subtle 底' },
      { name: 'TableRow', type: '原生 tr props', note: '自带 border-b + hover subtle' },
      { name: 'TableHeader / TableCell', type: '原生 th / td props', note: '默认 px-5,py-2(th)/ py-3.5(td),可覆写' },
    ],
    examples: [
      {
        label: '记录表',
        code: `<Table>
  <TableHead>
    <TableRow>
      <TableHeader>面试 / 会话</TableHeader>
      <TableHeader>时间</TableHeader>
    </TableRow>
  </TableHead>
  <TableBody>
    <TableRow>
      <TableCell>字节跳动 · 技术二面</TableCell>
      <TableCell>刚刚</TableCell>
    </TableRow>
  </TableBody>
</Table>`,
      },
    ],
  },
  {
    id: 'dialog',
    name: 'Modal',
    title: '弹窗',
    group: '反馈',
    description: 'head/body/foot 三段弹窗：md 600(默认)/ lg 680(设置)；模态焦点陷阱 + 滚动锁，Esc / 遮罩(scrim 令牌)/ X 关闭；body 可经 bodyClassName 整体替换(spec §8)。Portal 渲染，不透传 ref。',
    props: [
      { name: 'open', type: 'boolean', note: '受控开关' },
      { name: 'onOpenChange', type: '(open: boolean) => void', note: '单参回调(关闭源:Esc/遮罩/X 均收敛于此)' },
      { name: 'title', type: 'ReactNode', note: '头部标题(18/650)' },
      { name: 'footer', type: 'ReactNode', note: '脚部按钮区;省略则无脚' },
      { name: 'width', type: "'md' | 'lg'", def: "'md'", note: '600 / 680' },
      { name: 'bodyClassName', type: 'string', note: '覆盖 body 容器(自定义布局)' },
      { name: 'ConfirmModal.description', type: 'ReactNode', note: '确认弹窗正文(13px / 1.9 secondary)' },
      { name: 'ConfirmModal.confirmText / cancelText', type: 'string', def: "'确定' / '取消'", note: '双钮文案' },
      { name: 'ConfirmModal.danger', type: 'boolean', note: '危险确认:确认键红实底(移除/删除类)' },
      { name: 'ConfirmModal.onConfirm', type: '() => void', note: '点击确认后触发,随后弹窗自动关闭;异步结果用 toast 反馈' },
    ],
    examples: [
      {
        label: '基础弹窗',
        code: `<Modal
  open={open}
  onOpenChange={setOpen}
  title="开始新会话"
  footer={
    <>
      <Button>取消</Button>
      <Button variant="primary">开始新会话</Button>
    </>
  }
>
  <p>当前转写与回答会先存入面试记录。</p>
</Modal>`,
      },
      {
        label: '确认弹窗',
        code: `<ConfirmModal
  open={open}
  onOpenChange={setOpen}
  title="移除这份资料?"
  description="移除后需重新上传并构建索引,历史回答不受影响。"
  confirmText="移除"
  danger
  onConfirm={remove}
/>`,
      },
    ],
  },
  {
    id: 'toast',
    name: 'Toast',
    title: '轻提示',
    group: '反馈',
    description: '顶部居中悬浮，150ms 下滑浮现；类型实底白字：info 深藏青 / success 绿 / error 红(2026-09-11 修订，业界惯例)；模块级 toast.show() 可在组件树外调用(spec §3.3/§10)。',
    props: [
      { name: 'toast.show', type: "(title: string, options?: { type?; duration?; action? }) => string", note: '全局入口,返回 id;duration 默认 5000ms,0 = 常驻;action={label,onClick} 渲染动作钮(如「撤销」),点击后关闭' },
      { name: 'toast.dismiss', type: '(id?: string) => void', note: '关闭指定 toast;不传 id 关闭全部' },
      { name: 'AppToastProvider', type: 'children', note: '挂一次于应用根,渲染视口' },
    ],
    examples: [
      {
        label: '三种类型',
        code: `toast.show('已保存设置')
toast.show('索引构建完成', { type: 'success' })
toast.show('保存失败,请重试', { type: 'error' })

// 应用根:
<AppToastProvider>{children}</AppToastProvider>`,
      },
      {
        label: '动作与常驻',
        code: `toast.show('已移除资料', {
  type: 'success',
  action: { label: '撤销', onClick: restore },
})
const id = toast.show('索引构建中…', { duration: 0 })
// 完成后:
toast.dismiss(id)`,
      },
    ],
  },
  {
    id: 'collapsible',
    name: 'Collapse',
    title: '折叠详情',
    group: '反馈',
    description: 'details/summary 替代：边线圆角折叠卡，折叠头常驻卡内(图标自动 mr-2 垂直居中)，面板 mt-3 + pre-wrap 保留换行；用于答案区“本次检索资料 / 本次发送内容”(spec §11)。',
    props: [
      { name: 'summary', type: 'ReactNode', note: '折叠头文字' },
      { name: 'children', type: 'ReactNode', note: '面板内容(pre-wrap)' },
      { name: 'open / defaultOpen', type: 'boolean', note: '受控 / 非受控展开' },
      { name: 'onOpenChange', type: '(open: boolean) => void', note: '展开变化回调' },
    ],
    examples: [
      {
        label: '检索详情折叠',
        code: `<Collapse summary="本次检索资料(3 段,共 1,240 字)">
  {\`【简历 · 摘要】……\n【JD · 节选】……\`}
</Collapse>
<Collapse summary="本次发送内容(412 tokens)" defaultOpen>
  {\`系统提示词 + 问题 + 检索片段\`}
</Collapse>`,
      },
    ],
  },
]
