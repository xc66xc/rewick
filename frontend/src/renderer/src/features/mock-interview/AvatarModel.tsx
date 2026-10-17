import { useEffect, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { LoadingManager, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm'
import type { Avatar3DProps } from './Avatar3D'
import { disposeAvatar } from './disposeAvatar'
import { AVATAR_FRAME_MS, canAnimateAvatar, mouthTarget } from './avatarMotion'
import modelUrl from '../../assets/interviewer-3d/interviewer.vrm?url'

type Props = Avatar3DProps & { onReady: () => void; onError: (error: Error) => void }
export default function AvatarModel(props: Props) {
  const current = useRef(props)
  current.current = props
  const [model, setModel] = useState<VRM | null>(null)
  const { camera, invalidate } = useThree()
  useEffect(() => {
    const controller = new AbortController()
    let disposed = false
    let loaded: VRM | undefined
    const load = async () => {
      const response = await fetch(modelUrl, { signal: controller.signal })
      if (!response.ok) throw new Error(`Avatar HTTP ${response.status}`)
      const manager = new LoadingManager()
      let assetFailed = false
      manager.onError = () => { assetFailed = true }
      const loader = new GLTFLoader(manager).register((parser) => new VRMLoaderPlugin(parser))
      const result = await loader.parseAsync(await response.arrayBuffer(), '')
      if (assetFailed) { disposeAvatar(result.scene); throw new Error('Avatar texture loading failed') }
      const vrm = result.userData.vrm as VRM | undefined
      if (!vrm) { disposeAvatar(result.scene); throw new Error('Missing VRM data') }
      if (disposed) { disposeAvatar(vrm.scene); return }
      loaded = vrm
      const left = vrm.humanoid.getNormalizedBoneNode('leftUpperArm')
      const right = vrm.humanoid.getNormalizedBoneNode('rightUpperArm')
      if (left) left.rotation.z = -1.15
      if (right) right.rotation.z = 1.15
      vrm.humanoid.update()
      vrm.scene.updateMatrixWorld(true)
      const head = vrm.humanoid.getNormalizedBoneNode('head')?.getWorldPosition(new Vector3()) ?? new Vector3(0, 1.5, 0)
      camera.position.set(0, head.y - 0.1, 1.55)
      camera.lookAt(0, head.y - 0.12, 0)
      camera.updateProjectionMatrix()
      setModel(vrm)
      invalidate()
      current.current.onReady()
    }
    void load().catch((error: unknown) => { if (!disposed) current.current.onError(error instanceof Error ? error : new Error(String(error))) })
    return () => { disposed = true; controller.abort(); if (loaded) disposeAvatar(loaded.scene) }
  }, [camera, invalidate])
  useEffect(() => {
    if (!model) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = performance.now()
    let elapsed = 0
    let mouth = 0
    const head = model.humanoid.getNormalizedBoneNode('head')
    const base = head?.rotation.clone()
    const paint = (animated: boolean) => {
      const now = performance.now()
      const delta = Math.min(0.1, (now - last) / 1000)
      last = now
      elapsed += delta
      const { state, audioLevel, level } = current.current
      const target = animated ? mouthTarget(state, audioLevel?.current ?? level) : 0
      mouth = animated ? mouth + (target - mouth) * Math.min(1, delta * 18) : 0
      model.expressionManager?.setValue('aa', mouth * 0.8)
      model.expressionManager?.setValue('blink', animated && elapsed % 4.6 < 0.15 ? Math.sin(elapsed % 4.6 / 0.15 * Math.PI) : 0)
      if (head && base) {
        head.rotation.copy(base)
        if (animated) { head.rotation.x += Math.sin(elapsed * 1.5) * 0.025; head.rotation.z += Math.sin(elapsed * 0.6) * 0.018 }
      }
      model.humanoid.update()
      model.expressionManager?.update()
      model.nodeConstraintManager?.update()
      for (const material of model.materials ?? []) {
        if ('update' in material && typeof material.update === 'function') material.update(delta)
      }
      invalidate()
    }
    const tick = () => {
      const active = canAnimateAvatar(current.current.state, document.hidden, media.matches)
      paint(active)
      if (active) timer = setTimeout(tick, AVATAR_FRAME_MS)
    }
    const restart = () => { clearTimeout(timer); last = performance.now(); tick() }
    document.addEventListener('visibilitychange', restart)
    media.addEventListener('change', restart)
    restart()
    return () => { clearTimeout(timer); if (head && base) head.rotation.copy(base); document.removeEventListener('visibilitychange', restart); media.removeEventListener('change', restart) }
  }, [model, props.state, invalidate])
  return model ? <primitive object={model.scene} dispose={null} /> : null
}
