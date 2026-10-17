import type { RefObject } from 'react'
import type { MockSession } from '../../../../shared/mock-interview'
import { useAvatarFrame } from './useAvatarFrame'
import interviewer from '../../assets/mock-interviewer-atlas.png'

export default function Avatar2D({ state, level, audioLevel }: { state: MockSession['state']; level: number; audioLevel?: RefObject<number> }) {
  const { image, initial, position } = useAvatarFrame(state, level, audioLevel)
  return <img ref={image} className="mock-interviewer__atlas" src={interviewer} alt="" aria-hidden="true" draggable={false} data-frame={initial} style={{ transform: position }} />
}
