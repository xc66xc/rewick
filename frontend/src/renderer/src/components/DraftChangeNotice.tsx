import { Button } from './ui/button'
import { textButtonClass } from '../lib/form'

interface DraftChangeNoticeProps { onKeep: () => void; onDiscard: () => void }
export default function DraftChangeNotice({ onKeep, onDiscard }: DraftChangeNoticeProps) {
  return <div className="mb-5 rounded-chip border border-accent-line bg-accent-subtle px-4 py-4 text-xs text-text-secondary" role="status"><p className="mb-3">当前草稿尚未保存。继续操作前，请选择保留草稿或放弃修改。</p>
    <div className="flex flex-wrap items-center gap-3"><Button onClick={onKeep}>保留草稿</Button><button className={textButtonClass} onClick={onDiscard}>放弃草稿并继续</button></div>
  </div>
}
