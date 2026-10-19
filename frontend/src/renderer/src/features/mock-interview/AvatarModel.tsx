import { useEffect, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Box3, Group, LoadingManager, Mesh, PerspectiveCamera, SkinnedMesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Avatar3DProps } from './Avatar3D'
import { disposeAvatar } from './disposeAvatar'
import { useAvatarSway } from './useAvatarSway'
import { avatarDistance } from './avatarFraming'
import modelUrl from '../../assets/interviewer-3d/meshy-interviewer.glb?url'

type Props = Avatar3DProps & { onReady: () => void; onError: (error: Error) => void }
export default function AvatarModel(props: Props) {
  const current = useRef(props)
  current.current = props
  const [model, setModel] = useState<{ scene: Group; root: Group; size: Vector3 } | null>(null)
  const { camera, invalidate, size: viewport } = useThree()
  useAvatarSway(model?.root, model?.size.y ?? 0, props.state, invalidate)
  useEffect(() => {
    const controller = new AbortController()
    let disposed = false
    let loaded: Group | undefined
    const load = async () => {
      const response = await fetch(modelUrl, { signal: controller.signal })
      if (!response.ok) throw new Error(`Avatar HTTP ${response.status}`)
      const manager = new LoadingManager()
      let assetFailed = false
      manager.onError = () => { assetFailed = true }
      const result = await new GLTFLoader(manager).parseAsync(await response.arrayBuffer(), '')
      if (disposed) { disposeAvatar(result.scene); return }
      loaded = result.scene
      if (assetFailed) throw new Error('Avatar texture loading failed')
      let meshes = 0
      result.scene.traverse((object) => { if (object instanceof Mesh) meshes++ })
      if (!meshes) throw new Error('Avatar contains no renderable meshes')
      // Restore bind pose; do not create an AnimationMixer for Running/Walking.
      result.scene.traverse((object) => { if (object instanceof SkinnedMesh) object.pose() })
      result.scene.updateMatrixWorld(true)
      const box = new Box3().setFromObject(result.scene)
      const size = box.getSize(new Vector3())
      avatarDistance(size, 1, 32)
      result.scene.position.sub(box.getCenter(new Vector3()))
      const root = new Group()
      root.add(result.scene)
      setModel({ scene: result.scene, root, size })
      invalidate()
      current.current.onReady()
    }
    void load().catch((error: unknown) => { if (!disposed) current.current.onError(error instanceof Error ? error : new Error(String(error))) })
    return () => { disposed = true; controller.abort(); if (loaded) disposeAvatar(loaded) }
  }, [invalidate])
  useEffect(() => {
    if (!model) return
    try {
      if (!(camera instanceof PerspectiveCamera)) throw new Error('Avatar requires a perspective camera')
      camera.position.set(0, 0, avatarDistance(model.size, viewport.width / viewport.height, camera.fov))
      camera.lookAt(0, 0, 0)
      camera.updateProjectionMatrix()
      invalidate()
    } catch (error) { current.current.onError(error instanceof Error ? error : new Error(String(error))) }
  }, [camera, invalidate, model, viewport.width, viewport.height])
  return model ? <primitive object={model.root} dispose={null} /> : null
}
