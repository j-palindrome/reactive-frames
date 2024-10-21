import { useFBO } from '@react-three/drei'
import { createPortal, useFrame } from '@react-three/fiber'
import { range } from 'lodash'
import { forwardRef, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PlaneGeometry } from 'three'

const vert = /*glsl*/ `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);
}
`

type FeedbackTextureRef = {
  texture: THREE.Texture
}

const FeedbackTexture = forwardRef<
  FeedbackTextureRef,
  {
    fragmentShader: string
    width: number
    height: number
  }
>(({ fragmentShader, width, height }, ref) => {
  const { scene, camera } = useMemo(
    () => ({
      scene: new THREE.Scene(),
      camera: new THREE.OrthographicCamera(0, 1, 1, 0, 0, 1)
    }),
    []
  )

  const renderTargets = range(2).map(i =>
    useFBO(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      stencilBuffer: false,
      type: THREE.FloatType
    })
  )

  const frag = /*glsl*/ `
in vec2 vUv;

uniform sampler2D feedback;

vec3 solveFrag(vec3 lastPoint) {
  ${fragmentShader}
}

void main() {
  vec3 fragColor = solveFrag(texture(feedback, vUv));
  gl_FragColor = vec4(fragColor, 1);
}
`

  const feedbackMesh = useRef<THREE.Mesh<PlaneGeometry, THREE.ShaderMaterial>>(
    null!
  )

  let currentFrame = useRef(0)
  useFrame(state => {
    const { gl } = state
    const thisBuffer = renderTargets[currentFrame.current]
    currentFrame.current = currentFrame.current ? 0 : 1
    const lastBuffer = renderTargets[currentFrame.current]
    feedbackMesh.current.material.uniforms.feedback.value = lastBuffer.texture

    gl.setRenderTarget(thisBuffer)
    gl.clear()
    gl.render(scene, camera)
    gl.setRenderTarget(null)
    const r = ref as React.MutableRefObject<FeedbackTextureRef>
    r.current.texture = thisBuffer.texture
  })

  return (
    <>
      {createPortal(
        <mesh position={[0.5, 0.5, 0]} ref={feedbackMesh}>
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            fragmentShader={frag}
            vertexShader={vert}
            uniforms={{
              feedback: { value: renderTargets[0].texture },
              resolution: { value: new THREE.Vector2(width, height) }
            }}
          />
        </mesh>,
        scene
      )}
    </>
  )
})

export default FeedbackTexture
