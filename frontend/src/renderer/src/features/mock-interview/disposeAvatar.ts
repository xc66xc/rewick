import { Mesh, Texture, type Object3D } from 'three'
import { VRMUtils } from '@pixiv/three-vrm'

/** The GLTF loader creates ImageBitmaps; GPU disposal alone does not release these. */
export function disposeAvatar(scene: Object3D) {
  const images = new Set<ImageBitmap>()
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof Texture && typeof ImageBitmap !== 'undefined' && value.image instanceof ImageBitmap) images.add(value.image)
      }
    }
  })
  VRMUtils.deepDispose(scene)
  for (const image of images) image.close()
}
