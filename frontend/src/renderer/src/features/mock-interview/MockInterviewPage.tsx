import { useEffect, useRef, useState } from 'react'
import type { DesktopBridge, InterviewEnvironment } from '../../../../shared/types'
import type { MockCapabilities, MockCreate, MockSession } from '../../../../shared/mock-interview'
import { Button } from '../../components/ui/button'
import { ConfirmModal } from '../../components/ui/dialog'
import { toast } from '../../components/ui/toast'
import { formatDuration } from '../../hooks/useInterviewTime'
import { useMockInterview } from './useMockInterview'
import AvatarStage from './AvatarStage'
import MockPreparation from './MockPreparation'
import MockConversation from './MockConversation'
import MockHistory from './MockHistory'
import MockQaExport from './MockQaExport'
interface Props { bridge: DesktopBridge; onActive: (active: boolean) => void }
export default function MockInterviewPage({ bridge, onActive }: Props) {
  const pendingCreate = useRef<{ key: string; requestId: string } | null>(null)
  const [capabilities, setCapabilities] = useState<MockCapabilities>(); const [environments, setEnvironments] = useState<InterviewEnvironment[]>([])
  const [balance, setBalance] = useState(0); const [sessions, setSessions] = useState<MockSession[]>([])
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(false); const [deleting, setDeleting] = useState<MockSession>()
  const [ledger, setLedger] = useState<Awaited<ReturnType<DesktopBridge['mock']['ledger']>>>()
  const interview = useMockInterview(bridge.mock, onActive)
  async function refresh(signal?: AbortSignal) {
    const values = await Promise.all([bridge.mock.capabilities(), bridge.mock.wallet(), bridge.mock.list(), bridge.getInterviewLibrary()])
    if (signal?.aborted) return
    setCapabilities(values[0]); setBalance(values[1].availableSeconds); setSessions(values[2].items); setEnvironments(values[3].environments)
  }
  useEffect(() => {
    const controller = new AbortController()
    document.body.dataset.mockMode = 'true'
    void refresh(controller.signal).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '模拟面试加载失败。') }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { controller.abort(); delete document.body.dataset.mockMode }
  }, [bridge])
  useEffect(() => { if (interview.error) toast.show(interview.error, { type: 'error' }) }, [interview.error])
  async function open(session: MockSession) { setBusy(true); try { const latest = await bridge.mock.get(session.id); setSelected(true); await interview.open(latest) } catch (reason) { toast.show(reason instanceof Error ? reason.message : '打开会话失败。', { type: 'error' }) } finally { setBusy(false) } }
  async function create(input: MockCreate) { setBusy(true); const { requestId: _requestId, ...parameters } = input; const key = JSON.stringify(parameters); if (pendingCreate.current?.key !== key) pendingCreate.current = { key, requestId: input.requestId }; try { const value = await bridge.mock.create({ ...input, requestId: pendingCreate.current.requestId }); pendingCreate.current = null; setSelected(true); await interview.open(value); await refresh() } catch (reason) { toast.show(reason instanceof Error ? reason.message : '准备面试失败。', { type: 'error' }) } finally { setBusy(false) } }
  async function command(value: Parameters<typeof interview.command>[0]) { try { await interview.command(value); if (value === 'finish') await refresh() } catch { /* Controller exposes safe error to the toast subscription. */ } }
  async function remove() { if (!deleting) return; setBusy(true); try { await bridge.mock.remove(deleting.id); setDeleting(undefined); await refresh() } catch (reason) { toast.show(reason instanceof Error ? reason.message : '删除失败。', { type: 'error' }) } finally { setBusy(false) } }
  async function showLedger() { try { setLedger(await bridge.mock.ledger()) } catch (reason) { toast.show(reason instanceof Error ? reason.message : '流水加载失败。', { type: 'error' }) } }
  const current = selected ? interview.session : undefined
  return <div className="space-y-6 p-8 max-[820px]:p-5">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 tabIndex={-1} className="text-2xl font-semibold">AI 模拟面试</h1><p className="mt-2 text-sm text-text-secondary">练习真实表达，用有依据的追问发现改进空间。</p></div><div className="flex items-center gap-3"><span className="text-sm">模拟余额 <strong className="font-mono text-accent">{formatDuration(balance)}</strong></span><Button size="sm" onClick={() => void showLedger()}>余额流水</Button></div></header>
    {loading && <p role="status">正在读取模拟面试配置…</p>}
    {error && <section className="space-y-3"><p role="alert" className="text-danger">{error}</p><Button onClick={() => { setError(''); setLoading(true); void refresh().catch(reason => setError(String(reason))).finally(() => setLoading(false)) }}>重新加载</Button></section>}
    {capabilities && !capabilities.enabled && <p className="text-sm text-text-secondary">模拟面试暂未开放，请联系管理员确认功能开关、账号授权和语音服务配置。历史记录仍可查看。</p>}
    {current ? <><div className="flex flex-wrap items-center justify-between gap-3"><div><strong>{current.environmentName}</strong><span className="ml-3 text-sm text-text-secondary">本场剩余 {formatDuration(current.remainingSeconds)} · 已用 {formatDuration(current.usedSeconds)}</span></div>{['completed', 'ready', 'paused', 'error'].includes(current.state) && <Button onClick={() => { void interview.close(); setSelected(false); void refresh() }}>返回准备</Button>}{!interview.connected && current.state !== 'completed' && <Button disabled={busy} onClick={() => void open(current)}>重新连接</Button>}</div>
      <div className="grid grid-cols-[minmax(220px,.65fr)_minmax(0,1.35fr)] gap-5 max-[820px]:grid-cols-1"><AvatarStage state={current.state} level={interview.level} audioLevel={interview.audioLevel} connected={interview.connected} /><MockConversation interview={interview} onCommand={value => void command(value)} /></div>
      {current.state === 'completed' && <MockQaExport bridge={bridge.mock} id={current.id} />}</> : <>{capabilities?.enabled && <MockPreparation environments={environments} capabilities={capabilities} busy={busy} balance={balance} onCreate={input => void create(input)} />}<MockHistory sessions={sessions} onOpen={value => void open(value)} onRemove={setDeleting} /></>}
    {ledger && <section className="space-y-3 rounded-card border border-border bg-card p-5"><div className="flex justify-between"><h2 className="font-semibold">独立模拟余额流水</h2><Button size="sm" onClick={() => setLedger(undefined)}>收起</Button></div>{ledger.items.length === 0 && <p className="text-sm text-text-secondary">暂无流水。</p>}{ledger.items.map(item => <p key={item.id} className="text-sm text-text-secondary">{item.createdAt.replace('T', ' ')} · {item.reason} · {item.deltaSeconds > 0 ? '+' : ''}{item.deltaSeconds} 秒 · 余额 {formatDuration(item.balanceAfterSeconds)}</p>)}</section>}
    {deleting && <ConfirmModal title="删除模拟面试记录" description="将删除本场问答记录，余额流水仍保留。" open onOpenChange={open => { if (!open) setDeleting(undefined) }} confirmText="删除记录" danger onConfirm={() => { if (!busy) void remove() }} />}
  </div>
}
