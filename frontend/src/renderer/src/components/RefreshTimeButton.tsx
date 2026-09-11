import { ArrowClockwise } from '@phosphor-icons/react'
import IconButton from './IconButton'

interface Props { refreshing: boolean; onRefresh: () => Promise<void> }

export default function RefreshTimeButton({ refreshing, onRefresh }: Props) {
  return <IconButton label={refreshing ? '正在刷新时长' : '刷新时长'} disabled={refreshing} aria-busy={refreshing} onClick={() => void onRefresh()}>
    <ArrowClockwise size={18} aria-hidden="true" />
  </IconButton>
}
