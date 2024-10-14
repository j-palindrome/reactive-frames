import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { last, range, sum, sumBy } from 'lodash'
import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { multiBezier2 } from '../util/src/shaders/bezier'
import { hash } from '../util/src/shaders/utilities'

const tempObject = new THREE.Object3D()

export default function Asemic({ children }) {
  const points = useRef<[number, number][]>([])
  return (
    <>
      <Canvas
        className='fixed h-screen w-screen'
        gl={{ antialias: true }}
        orthographic
        camera={{
          position: [0, 0, 0],
          near: 0,
          far: 1,
          left: 0,
          top: 1,
          right: 1,
          bottom: 0
        }}
        onClick={ev => {
          if (ev.shiftKey) {
            points.current = []
          }
          const point = [
            ev.clientX / window.innerWidth,
            (window.innerHeight - ev.clientY) / window.innerHeight
          ] as [number, number]
          points.current.push(point)
          const text = points.current
            .map(x => `[${x[0].toFixed(2)}, ${x[1].toFixed(2)}]`)
            .join(', ')
          window.navigator.clipboard.writeText(text)
        }}>
        <color attach='background' args={['#000000']} />
        {children}
      </Canvas>
    </>
  )
}

type Point = {
  position: Vector2
  thickness?: number
  alpha?: number
  color?: THREE.Color
}

export function Brush({
  keyframes,
  spacing = 0,
  size = 1,
  jitter = {
    size: 0,
    position: 0
  },
  degree = 2
}: {
  keyframes: { curves: Point[][] }[]
  spacing?: number
  size: number
  jitter?: {
    size?: number
    position?: number
  }
  degree?: 2 | 3
}) {
  const resolution = useThree(scene =>
    scene.gl.getDrawingBufferSize(new THREE.Vector2())
  )

  const meshRef = useRef<
    THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  >(null!)
  const keyframeCount = keyframes.length
  const curvesCount = keyframes[0].curves.length
  const controlPointsCount = keyframes[0].curves[0].length
  const aspectRatio = window.innerWidth / window.innerHeight
  const subdivisions = (controlPointsCount - degree) / (degree - 1)
  const sampleEachCurve = 100
  const curveProgressSamples = subdivisions * sampleEachCurve + 1

  let maxLength = 0
  const progress = keyframes.flatMap(x =>
    x.curves.flatMap(curve => {
      const curvePath = new THREE.CurvePath()
      const segments: THREE.Curve<Vector2>[] = []
      range(subdivisions).forEach(i => {
        const thisCurve = new THREE.QuadraticBezierCurve(
          curve[i].position.clone().lerp(curve[i + 1].position, 0.5),
          curve[i + 1].position,
          curve[i + 1].position.clone().lerp(curve[i + 2].position, 0.5)
        )
        curvePath.add(thisCurve)
        segments.push(thisCurve)
      })
      const length = curvePath.getLength()
      if (length > maxLength) maxLength = length
      const curveProgress = curvePath.getCurveLengths().map((x, i) => ({
        end: x / length,
        start: (x - curvePath.curves[i].getLength()) / length,
        index: i
      }))

      return range(curveProgressSamples).map(progressI => {
        progressI /= curveProgressSamples - 1
        const thisSegment = curveProgress.find(
          x => x.end >= progressI && x.start <= progressI
        )!
        // we're getting the total length...
        // t is processed BETWEEN 1/3, 2/3, and 3/3 for 3 segments.
        return (
          // @ts-expect-error
          curvePath.curves[thisSegment.index].getUtoTmapping(
            // scale [0-1] over whole curve
            (progressI - thisSegment.start) /
              (thisSegment.end - thisSegment.start)
          ) /
            // place within the properly divided segment
            curveProgress.length +
          thisSegment.index / curveProgress.length
        )
      })
    })
  )

  const vertexCount =
    (maxLength * window.innerWidth * devicePixelRatio) / (spacing + 1)

  // write keyframes to 3D data texture.
  // read them into the shaders.

  const { pointsTex, colorTex, progressTex } = useMemo(() => {
    const createTexture = (
      getPoint: (point: Point) => number[],
      format: THREE.AnyPixelFormat
    ) => {
      const array = new Float32Array(
        keyframes.flatMap(keyframe => {
          return keyframe.curves.flatMap(curve => {
            return curve.flatMap(point => {
              return getPoint(point)
            })
          })
        })
      )

      const tex = new THREE.Data3DTexture(
        array,
        controlPointsCount,
        curvesCount,
        keyframeCount
      )
      tex.format = format
      tex.type = THREE.FloatType
      tex.minFilter = tex.magFilter = THREE.LinearFilter
      tex.needsUpdate = true
      return tex
    }

    const progressTex = new THREE.Data3DTexture(
      Float32Array.from(progress),
      curveProgressSamples,
      curvesCount,
      keyframeCount
    )
    progressTex.format = THREE.RedFormat
    progressTex.type = THREE.FloatType
    progressTex.minFilter = progressTex.magFilter = THREE.LinearFilter
    progressTex.needsUpdate = true

    const pointsTex = createTexture(point => {
      return [...point.position.toArray(), point.thickness ?? 1, 0]
    }, THREE.RGBAFormat)

    const colorTex = createTexture(
      point => [...(point.color?.toArray() ?? [1, 1, 1]), point.alpha ?? 1],
      THREE.RGBAFormat
    )
    return { pointsTex, colorTex, progressTex }
  }, [keyframes])

  useFrame(scene => {
    const time =
      Math.sin((scene.clock.getElapsedTime() % Math.PI) * 2 * 1) * 0.5 + 0.5
    meshRef.current.material.uniforms.progress.value = time
    meshRef.current.material.uniformsNeedUpdate = true
  })

  const pointProgress = useMemo(() => {
    return Float32Array.from(
      range(curvesCount).flatMap(curveI => {
        return range(vertexCount).flatMap(vertexI => [
          // sample from middle of pixels
          vertexI / vertexCount,
          curveI / curvesCount
        ])
      })
    )
  }, [resolution])

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, vertexCount * curvesCount]}
      position={[0, 0, 0]}>
      <planeGeometry
        // @ts-expect-error
        args={[1, 1 * aspectRatio].map(x => (x / window.innerWidth) * size)}>
        <instancedBufferAttribute
          attach='attributes-pointInfo'
          args={[pointProgress, 2]}
        />
      </planeGeometry>
      <shaderMaterial
        transparent
        uniforms={{
          progress: { value: 0 },
          progressTex: { value: progressTex },
          keyframeCount: { value: keyframeCount },
          progressCount: { value: curveProgressSamples },
          pointsTex: { value: pointsTex },
          colorTex: { value: colorTex },
          jitterSize: { value: jitter.size },
          jitterPosition: { value: jitter.position },
          hashSeed: { value: Math.random() }
        }}
        vertexShader={
          /*glsl*/ `
          in vec2 pointInfo;

          uniform sampler3D pointsTex;
          uniform sampler3D colorTex;
          uniform sampler3D progressTex;
          uniform float progress;
          uniform float keyframeCount;
          uniform float progressCount;
          uniform float jitterSize;
          uniform float jitterPosition;
          uniform float hashSeed;

          out vec2 vUv;
          out vec4 vColor;
          out float v_test;
          out float discardPoint;

          ${multiBezier2(controlPointsCount)}
          ${hash}

          void main() {
            vUv = uv;
            // t to U mapping...
            float keyframeProgress = (progress * (1. - 1. / keyframeCount) + 0.5 / keyframeCount);
            float curveProgress = pointInfo.y;
            float pointProgress = texture(
              progressTex, 
              vec3(pointInfo.x
                * (1. - (1. / progressCount)) 
                + 0.5 / progressCount, 
              curveProgress, 
              keyframeProgress)).x;

            vec2[${controlPointsCount}] points = vec2[${controlPointsCount}](
              ${range(controlPointsCount)
                .map(
                  i =>
                    /*glsl*/ `texture(pointsTex, vec3(${i}. / ${
                      controlPointsCount - 1
                    }., curveProgress, keyframeProgress)).xy`
                )
                .join(', ')}
            );
            vec2 thisPosition = 
              multiBezier2(pointProgress, points);
              // texture(pointsTex, vec3(pointProgress, curveProgress, keyframeProgress)).xy;
              // lerp(pointProgress, vec2(0, 0), vec2(1, 1));
                // + vec2(hash(pointProgress * 0.1423, hashSeed), hash(pointProgress * 0.5264, hashSeed))
                // * jitterPosition;
            // thisPosition = vec2(pointInfo.x, pointProgress);
            float thisThickness = texture(pointsTex, vec3(pointProgress, curveProgress, keyframeProgress)).z;
            vColor = texture(colorTex, vec3(pointProgress, curveProgress, keyframeProgress));
            v_test = pointProgress;

            
            gl_Position = 
            projectionMatrix 
            // * modelViewMatrix 
            // * instanceMatrix
            * (vec4(thisPosition, 0, 0) + vec4(position.xy, 0, 1));
          }`
        }
        fragmentShader={
          /*glsl*/ `
          in vec2 vUv;
          in vec4 vColor;
          in float v_test;
          in float discardPoint;

          void main() {
            // if (discardPoint == 1.) discard;
            if (length(vUv - 0.5) > 0.707 - 0.2) discard;
            gl_FragColor = vColor;
          }`
        }
      />
    </instancedMesh>
  )
}
