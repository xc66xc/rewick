import { Component, useEffect, useState, type ReactNode, type RefObject } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import type { MockSession } from '../../../../shared/mock-interview'
import { Button } from '../../components/ui/button'
import AvatarModel from './AvatarModel'
import office from '../../assets/interviewer-3d/office.png'

export interface Avatar3DProps { state: MockSession['state']; level: number; audioLevel?: RefObject<number> }
class SceneBoundary extends Component<{ children: ReactNode; onError: (error: Error) => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { this.props.onError(error) }
  render() { return this.state.failed ? null : this.props.children }
}
function CanvasHealth({ onError }: { onError: (error: Error) => void }) {
  const { gl } = useThree()
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onError(new Error('WebGL context lost')) }
    gl.domElement.addEventListener('webglcontextlost', lost)
    return () => gl.domElement.removeEventListener('webglcontextlost', lost)
  }, [gl, onError])
  return null
}
export default function Avatar3D(props: Avatar3DProps) {
  const [error, setError] = useState<Error | null>(null)
  const [ready, setReady] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const fail = (reason: Error) => { console.error('3D interviewer:', reason); setError(reason) }
  return <div className="mock-interviewer__3d" style={{ backgroundImage: `url(${office})` }} data-model-ready={ready && !error}>
    {!error && <SceneBoundary key={attempt} onError={fail}>
      <Canvas frameloop="demand" dpr={[1, 1.25]} camera={{ position: [0, 1.4, 2], fov: 32 }} gl={{ antialias: true, alpha: true }} fallback={<p>设备不支持 3D，请在下方切换 2D。</p>}>
        <CanvasHealth onError={fail} />
        <ambientLight intensity={1.6} /><directionalLight position={[1, 3, 3]} intensity={2} />
        <AvatarModel {...props} onReady={() => setReady(true)} onError={fail} />
      </Canvas>
    </SceneBoundary>}
    {!ready && !error && <p className="mock-interviewer__loading" role="status">正在加载 3D 角色…</p>}
    {error && <div className="mock-interviewer__loading" role="alert"><p>3D 角色加载或渲染失败</p><p className="mt-2 text-xs">可以重试，或在下方切换 2D，语音问答继续保留。</p><Button className="mt-3" onClick={() => { setError(null); setReady(false); setAttempt((value) => value + 1) }}>重试加载</Button></div>}
  </div>
}
