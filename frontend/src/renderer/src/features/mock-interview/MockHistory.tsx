import type { MockSession } from '../../../../shared/mock-interview'
import { Button } from '../../components/ui/button'
interface Props { sessions: MockSession[]; onOpen: (session: MockSession) => void; onRemove: (session: MockSession) => void }
const states = { ready: '待开始', starting: '准备中', speaking: '进行中', listening: '进行中', deciding: '进行中', paused: '已暂停', completed: '已结束', error: '异常' }
export default function MockHistory({ sessions, onOpen, onRemove }: Props) {
  return <section className="space-y-4"><h2 className="text-lg font-semibold">模拟面试记录</h2>{sessions.length === 0 && <p className="text-sm text-text-secondary">完成第一场模拟面试后，在这里查看逐题记录和复盘。</p>}{sessions.map(session => <article key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card p-4"><div><h3 className="text-sm font-semibold">{session.environmentName}</h3><p className="mt-1 text-xs text-text-secondary">{session.createdAt.replace('T', ' ')} · {states[session.state]} · 已用 {Math.ceil(session.usedSeconds / 60)} 分钟</p></div><div className="flex gap-2"><Button size="sm" onClick={() => onOpen(session)}>{session.state === 'completed' ? '查看复盘' : '打开会话'}</Button>{['completed', 'ready', 'error'].includes(session.state) && <Button variant="outline" className="text-danger" size="sm" onClick={() => onRemove(session)}>删除记录</Button>}</div></article>)}</section>
}
