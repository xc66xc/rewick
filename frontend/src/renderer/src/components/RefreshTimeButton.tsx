import { ArrowClockwise } from '@phosphor-icons/react'
import { IconButton } from './ui/button'

interface Props { refreshing: boolean; onRefresh: () => Promise<void>; className?: string }

export default function RefreshTimeButton({ refreshing, onRefresh, className }: Props) {
  return <IconButton className={className} aria-label={refreshing ? '正在刷新时长' : '刷新时长'} title={refreshing ? '正在刷新时长' : '刷新时长'} disabled={refreshing} aria-busy={refreshing} onClick={() => void onRefresh()}>
    <ArrowClockwise aria-hidden="true" />
  </IconButton>
}
