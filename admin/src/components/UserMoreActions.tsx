import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DotsThree } from '@phosphor-icons/react'
import styles from '../styles.module.css'
type Action = 'history' | 'password' | 'revoke'
const actions: { kind: Action; label: string }[] = [{ kind: 'history', label: '时长记录' }, { kind: 'password', label: '重置密码' }, { kind: 'revoke', label: '撤销登录' }]
export default function UserMoreActions({ name, onSelect }: { name: string; onSelect: (action: Action) => void }) {
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  useEffect(() => {
    if (!position) return
    panel.current?.querySelector('button')?.focus()
    const close = () => setPosition(null)
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) close()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); trigger.current?.focus() }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [position])
  return <><button ref={trigger} className={styles.linkButton} aria-label={`更多操作 ${name}`} aria-expanded={Boolean(position)} onClick={() => {
    const rect = trigger.current!.getBoundingClientRect()
    setPosition(position ? null : { top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 146)), left: Math.max(8, Math.min(rect.right - 160, window.innerWidth - 168)) })
  }}>更多 <DotsThree size={18} aria-hidden="true" /></button>{position && createPortal(<div ref={panel} className={styles.actionPopover} style={position} role="group" aria-label={`${name} 的更多操作`} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setPosition(null)
  }}>{actions.map(action => <button key={action.kind} aria-label={`${action.label} ${name}`} onClick={() => { trigger.current?.focus(); setPosition(null); onSelect(action.kind) }}>{action.label}</button>)}</div>, document.body)}</>
}
