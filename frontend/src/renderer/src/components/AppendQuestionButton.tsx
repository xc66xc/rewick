import { useEffect, useRef, useState } from 'react'
import { Check, Plus } from '@phosphor-icons/react'
import { Button } from './ui/button'

interface AppendQuestionButtonProps {
  segmentId: string; text: string; disabled: boolean; onAppend: (id: string) => boolean
}

export default function AppendQuestionButton({ segmentId, text, disabled, onAppend }: AppendQuestionButtonProps) {
  const [added, setAdded] = useState(false)
  const cooldown = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { clearTimeout(timer.current) }, []) // Feedback belongs to this sentence button's mounted lifetime.
  return <Button variant="outline" size="xs" className="border-accent-line text-accent-text hover:border-accent-line hover:bg-accent-subtle hover:text-accent-text"
    aria-label={`加入问题：${text}`} title="追加到当前问题，合并后手动生成回答"
    disabled={disabled || added || !text.trim()} onMouseDown={event => { if (event.button === 0) event.preventDefault() }}
    onClick={event => {
      if (cooldown.current || !onAppend(segmentId)) return
      cooldown.current = true; setAdded(true)
      timer.current = setTimeout(() => { cooldown.current = false; setAdded(false) }, 800)
      // The append must snapshot visible text before blur can apply buffered ASR.
      event.currentTarget.focus({ preventScroll: true })
      // 鼠标触发随即释放焦点,避免焦点钉住本条操作行不随鼠标移开收起;键盘触发保留焦点以便继续 Tab。
      if (event.detail > 0) event.currentTarget.blur()
    }}>
    {added ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}{added ? '已加入' : '加入问题'}
  </Button>
}
