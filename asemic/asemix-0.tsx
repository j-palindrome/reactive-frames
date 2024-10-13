import * as THREE from 'three'
import React, { useRef, useMemo, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, Bloom } from '@react-three/postprocessing'
import { Vector2 } from 'three'
import { ShaderMaterial } from 'three'
import { max, maxBy, range } from 'lodash'
import anime from 'animejs'
import { animated } from '@react-spring/three'
import { lerp } from 'three/src/math/MathUtils.js'

const tempObject = new THREE.Object3D()

export default function Asemic() {
  const points = useRef<[number, number][]>([])

  return (
    <>
      <Canvas
        className='fixed h-screen w-screen'
        gl={{ antialias: false }}
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
        resize={{
          scroll: false
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
          console.log(point)
        }}>
        <color attach='background' args={['#000000']} />
        {range(19).map(x => (
          <Brush
            key={x}
            keyframes={range(2).map(x => ({
              curve: new THREE.SplineCurve(
                range(5).map(x => new Vector2(Math.random(), Math.random()))
              ),
              thickness: new THREE.SplineCurve(
                range(5).map(x => new Vector2(x / 5, Math.random()))
              )
            }))}
            size={10}
          />
        ))}
      </Canvas>
    </>
  )
}

export function Brush({
  keyframes,
  density = 1,
  size = 1
}: {
  keyframes: { curve: THREE.Curve<Vector2>; thickness: THREE.Curve<Vector2> }[]
  density?: number
  size: number
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  const { mappedKeyframes, count } = useMemo(() => {
    const mappedKeyframes: {
      curvePoints: Vector2[]
      thicknessPoints: number[]
    }[] = []
    for (let { curve, thickness } of keyframes) {
      let count = 0
      const length = curve.getLength()
      const curvePoints: Vector2[] = []
      const thicknessPoints: number[] = []
      let i = 0
      const vwSize = size / window.innerWidth
      while (i < length) {
        count++
        const thisThickness = thickness.getPointAt(i / length).y // the scale
        thicknessPoints.push(thisThickness)
        curvePoints.push(curve.getPointAt(i / length))
        i += (thisThickness * vwSize) / 2 / density // size is in pixels, so progress according to vw
      }
      mappedKeyframes.push({ curvePoints, thicknessPoints })
    }
    const maxCount = max(mappedKeyframes.map(x => x.curvePoints.length))!
    for (let keyframe of mappedKeyframes) {
      if (keyframe.curvePoints.length === maxCount) continue
      const thisLength = keyframe.curvePoints.length
      // if maxCount is 1, thisLength = 0.8, step = 1.25
      function mapToMaxCount(points: any[]) {
        const step = maxCount / thisLength
        let lastI = 0
        let i = 0
        const newPoints = points.flatMap(point => {
          // stepping by 1.25, you get 0, 1.25, 2.5, 3.75, then at 5 you get two points (3-5) collapsed
          const pointCount = Math.floor(i - lastI) // number of maxCount points that collapse to this point
          lastI = Math.floor(i)
          i += step
          if (pointCount > 1) {
            return range(pointCount).map(() => point)
          } else {
            return point
          }
        })
        while (newPoints.length < maxCount)
          newPoints.push(newPoints[newPoints.length - 1])
        return newPoints
      }

      keyframe.curvePoints = mapToMaxCount(keyframe.curvePoints)
      keyframe.thicknessPoints = mapToMaxCount(keyframe.thicknessPoints)
    }
    return { mappedKeyframes, count: maxCount }
  }, [JSON.stringify(keyframes)])

  useFrame(state => {
    const time = state.clock.getElapsedTime()
    let i = 0
    const progress = time % 1
    // 0-0.25, 0.75-1 = 4-5
    const currentProgress = Math.floor(progress * (mappedKeyframes.length - 1))
    const nextProgress = Math.ceil(progress * (mappedKeyframes.length - 1))
    const scaledProgress =
      (progress - currentProgress) * (mappedKeyframes.length - 1)
    const thisArray = mappedKeyframes[currentProgress]
    const nextArray = mappedKeyframes[nextProgress]
    console.log(currentProgress, nextProgress)

    for (let x = 0; x < count; x++) {
      const id = i++
      tempObject.position.set(
        lerp(
          thisArray.curvePoints[x].x,
          nextArray.curvePoints[x].x,
          scaledProgress
        ),
        lerp(
          thisArray.curvePoints[x].y,
          nextArray.curvePoints[x].y,
          scaledProgress
        ),
        0
      )
      const thickness = lerp(
        thisArray.thicknessPoints[x],
        nextArray.thicknessPoints[x],
        scaledProgress
      )
      tempObject.scale.set(thickness, thickness, 1)
      tempObject.updateMatrix()
      meshRef.current.setMatrixAt(id, tempObject.matrix)
    }

    meshRef.current.instanceMatrix.needsUpdate = true
  })

  const { gl } = useThree()
  useEffect(() => {
    const material = meshRef.current.material as ShaderMaterial
    console.log(gl.properties.get(material))
  }, [])

  const aspectRatio = window.innerWidth / window.innerHeight
  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      position={[0, 0, 0]}>
      <planeGeometry
        // @ts-expect-error
        args={[1, 1 * aspectRatio].map(x => (x / window.innerWidth) * size)}
      />
      <shaderMaterial
        vertexShader={
          /*glsl*/ `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1);
        }`
        }
        fragmentShader={
          /*glsl*/ `
        in vec2 vUv;
        void main() {
          if (length(vUv - 0.5) > 0.707 - 0.2) {
            discard;
          }
          gl_FragColor = vec4(1, 1, 1, 1);
        }`
        }
      />
    </instancedMesh>
  )
}
