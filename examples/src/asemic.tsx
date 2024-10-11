import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer, N8AO, Bloom } from '@react-three/postprocessing'
import niceColors from 'nice-color-palettes'

const tempObject = new THREE.Object3D()
const tempColor = new THREE.Color()
const data = Array.from({ length: 1000 }, () => ({
  color: niceColors[17][Math.floor(Math.random() * 5)],
  scale: 1
}))

export default function AsemicTest() {
  // const controlPoints = useMemo(() => {
  //   return new THREE.DataTexture(
  //     new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]),
  //     4,
  //     1,
  //     THREE.RGFormat
  //   )
  // }, [])

  // const particleCount = 75000
  // const translateArray = useMemo(() => {
  //   const translateArray = new Float32Array(particleCount * 3)

  //   for (let i = 0, i3 = 0, l = particleCount; i < l; i++, i3 += 3) {
  //     translateArray[i3 + 0] = Math.random() * 2 - 1
  //     translateArray[i3 + 1] = Math.random() * 2 - 1
  //     translateArray[i3 + 2] = Math.random() * 2 - 1
  //   }

  //   return translateArray
  // }, [])

  // const circleGeometry = useMemo(() => new THREE.CircleGeometry(1, 6), [])

  return (
    <Canvas
      gl={{ antialias: false }}
      camera={{ position: [0, 0, 15], near: 5, far: 20 }}>
      <color attach='background' args={['#f0f0f0']} />
      <Boxes />
      <EffectComposer disableNormalPass>
        <N8AO aoRadius={0.5} intensity={1} />
        <Bloom luminanceThreshold={1} intensity={0.5} levels={9} mipmapBlur />
      </EffectComposer>
      {/* <mesh scale={[500, 500, 500]}>
         <instancedBufferGeometry index={circleGeometry.index}>
          <instancedBufferAttribute array={translateArray} itemSize={3} />
        </instancedBufferGeometry>
        <rawShaderMaterial
          uniforms={{
            map: {
              value: new THREE.TextureLoader().load(
                'textures/sprites/circle.png'
              )
            },
            time: { value: 0.0 }
          }}
          vertexShader={
             `
        precision highp float;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        uniform float time;

        attribute vec3 position;
        attribute vec2 uv;
        attribute vec3 translate;

        varying vec2 vUv;
        varying float vScale;

        void main() {

          vec4 mvPosition = modelViewMatrix * vec4( translate, 1.0 );
          vec3 trTime = vec3(translate.x + time,translate.y + time,translate.z + time);
          float scale =  sin( trTime.x * 2.1 ) + sin( trTime.y * 3.2 ) + sin( trTime.z * 4.3 );
          vScale = scale;
          scale = scale * 10.0 + 10.0;
          mvPosition.xyz += position * scale;
          vUv = uv;
          gl_Position = projectionMatrix * mvPosition;

        }
        `
          }
          fragmentShader={
             `
          precision highp float;

          uniform sampler2D map;

          varying vec2 vUv;
          varying float vScale;

          // HSL to RGB Convertion helpers
          vec3 HUEtoRGB(float H){
            H = mod(H,1.0);
            float R = abs(H * 6.0 - 3.0) - 1.0;
            float G = 2.0 - abs(H * 6.0 - 2.0);
            float B = 2.0 - abs(H * 6.0 - 4.0);
            return clamp(vec3(R,G,B),0.0,1.0);
          }

          vec3 HSLtoRGB(vec3 HSL){
            vec3 RGB = HUEtoRGB(HSL.x);
            float C = (1.0 - abs(2.0 * HSL.z - 1.0)) * HSL.y;
            return (RGB - 0.5) * C + HSL.z;
          }

          void main() {
            vec4 diffuseColor = texture2D( map, vUv );
            gl_FragColor = vec4( diffuseColor.xyz * HSLtoRGB(vec3(vScale/5.0, 1.0, 0.5)), diffuseColor.w );

            if ( diffuseColor.w < 0.5 ) discard;
          }`
          }
          depthTest
          depthWrite
        />
      </mesh> */}

      {/* <mesh>
        <rawShaderMaterial
          uniforms={{
            count: { value: 100 },
            controlPoints: { value: controlPoints },
            controlPointsLength: { value: 4 },
            size: { value: 60 * devicePixelRatio },
            jitterBias: { value: 0 },
            rotationJitter: { value: 0 },
            positionJitter: { value: 0 },
            sizeJitter: { value: 0 }
          }}
          vertexShader={
            glsl `
            in float index;
            in vec2 vertex;
            
            out float instance;
            out vec2 tf_test;
            
            uniform sampler2D controlPoints;
            uniform float controlPointsLength;
            uniform float size;
            uniform vec2 resolution;
            uniform float jitterBias;
            uniform float rotationJitter;
            uniform float positionJitter;
            uniform float sizeJitter;

            ${hash}
            ${rotate2d}
            ${PI}
            ${catmullRomSpline}

            void main() {
              instance = float(gl_InstanceID);

              float controlPointProgress = 1. / controlPointsLength;
              vec2 p0 = texture(controlPoints, vec2(0, 0)).xy;
              vec2 p1 = texture(controlPoints, vec2(0.25, 0)).xy;
              vec2 p2 = texture(controlPoints, vec2(0.5, 0)).xy;
              vec2 p3 = texture(controlPoints, vec2(0.75, 0)).xy;
              tf_test = p3;
              p0 = vec2(0., 0.);
              p1 = vec2(0., 0.);
              p2 = vec2(1, 1);
              p3 = vec2(1, 1);
              vec2 point = catmullRomSpline(index, p0, p1, p2, p3);

              float pointSize = size / resolution.x;
              float jitterHash = hash(point.x);
              float jitterSign = hash(point.x + 3.1432);
              float rotation = 0.;
              if (jitterSign > 0.5) jitterSign = 1.0;
              else jitterSign = -1.0;

              gl_Position = vec4(
                // rotate2d(
                //   position.xy * (pointSize + (hash(point.x + 0.8241) - 0.5) * sizeJitter * pointSize)
                //     + vec2(pow(jitterHash, (1.0 + jitterBias)) * jitterSign) * (positionJitter * pointSize), 
                //   -rotation + (hash(point.x + 1.2341) - 0.5) * rotationJitter * PI) 
                // + point, 
                point + (vertex / (resolution / resolution.x) - 0.5) * pointSize,
                0, 1);
            }`
          }
          fragmentShader={
            glsl `
            in float instance;
            
            void main() {
              // fragColor = vec4(tf_test, 1, 1);
              // fragColor = vec4(texture(controlPoints, vec2(0.5, 0)).xy, 0, 1);
              gl_FragColor = vec4(1, 1, 1, 1);
            }`
          }
        />
        <bufferGeometry>
          <bufferAttribute
            attach='attributes-vertex'
            itemSize={2}
            array={new Float32Array([0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 1, 1])}
          />
          <instancedBufferAttribute
            attach='attributes-index'
            itemSize={1}
            array={new Float32Array(range(100).map(x => x / 100))}
          />
        </bufferGeometry>
      </mesh> */}
    </Canvas>
  )
}

function Boxes() {
  const [hovered, set] = useState<number | undefined>(null!)
  const colorArray = useMemo(
    () =>
      Float32Array.from(
        new Array(1000)
          .fill()
          .flatMap((_, i) => tempColor.set(data[i].color).toArray())
      ),
    []
  )
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const prevRef = useRef<number>(null!)
  useEffect(() => void (prevRef.current = hovered!), [hovered])

  useFrame(state => {
    const time = state.clock.getElapsedTime()
    meshRef.current.rotation.x = Math.sin(time / 4)
    meshRef.current.rotation.y = Math.sin(time / 2)
    let i = 0
    for (let x = 0; x < 10; x++)
      for (let y = 0; y < 10; y++)
        for (let z = 0; z < 10; z++) {
          const id = i++
          tempObject.position.set(5 - x, 5 - y, 5 - z)
          tempObject.rotation.y =
            Math.sin(x / 4 + time) +
            Math.sin(y / 4 + time) +
            Math.sin(z / 4 + time)
          tempObject.rotation.z = tempObject.rotation.y * 2
          if (hovered !== prevRef.current) {
            ;(id === hovered
              ? tempColor.setRGB(10, 10, 10)
              : tempColor.set(data[id].color)
            ).toArray(colorArray, id * 3)
            meshRef.current.geometry.attributes.color.needsUpdate = true
          }
          tempObject.updateMatrix()
          meshRef.current.setMatrixAt(id, tempObject.matrix)
        }
    meshRef.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, 1000]}
      onPointerMove={e => (e.stopPropagation(), set(e.instanceId))}
      onPointerOut={e => set(undefined)}>
      <boxGeometry args={[0.6, 0.6, 0.6]}>
        <instancedBufferAttribute
          attach='attributes-color'
          args={[colorArray, 3]}
        />
      </boxGeometry>
      <meshBasicMaterial toneMapped={false} vertexColors />
    </instancedMesh>
  )
}
