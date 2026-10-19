import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { PMREMGenerator } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

/** Locally generated image-based lighting for the model's original PBR materials. */
export default function AvatarEnvironment() {
  const { gl, scene, invalidate } = useThree()
  useEffect(() => {
    const generator = new PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const environment = generator.fromScene(room)
    room.dispose()
    generator.dispose()
    const previous = scene.environment
    scene.environment = environment.texture
    invalidate()
    return () => { if (scene.environment === environment.texture) scene.environment = previous; environment.dispose() }
  }, [gl, scene, invalidate])
  return null
}
