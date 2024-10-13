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
import { bezier2, bezierN, multiBezier2 } from '../util/src/shaders/bezier'
import { hash } from '../util/src/shaders/utilities'
import { NURBSCurve } from 'three/examples/jsm/curves/NURBSCurve.js'

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

        {/* range(19).map(x => ( */}
        {range(2000).map(x => (
          <Brush
            key={x}
            keyframes={[
              {
                curve: range(7).map(x => [Math.random(), Math.random()]),
                thickness: range(7).map(x => Math.random())
              },
              {
                curve: range(7).map(x => [Math.random(), Math.random()]),
                thickness: range(7).map(x => Math.random())
              }
            ]}
            size={1}
          />
        ))}
      </Canvas>
    </>
  )
}

export function Brush({
  keyframes,
  density = 1,
  size = 1,
  jitter = {
    size: 0,
    position: 0
  },
  degree = 2
}: {
  keyframes: { curve: [number, number][]; thickness: number[] }[]
  density?: number
  size: number
  jitter?: {
    size?: number
    position?: number
  }
  degree?: 2 | 3
}) {
  const meshRef = useRef<
    THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  >(null!)
  let maxLength = 0
  for (let { curve } of keyframes) {
    const length = new THREE.SplineCurve(
      curve.map(x => new Vector2(...x))
    ).getLength()
    if (length > maxLength) maxLength = length
  }
  const count = (maxLength * window.innerWidth) / density

  const { gl } = useThree()

  const aspectRatio = window.innerWidth / window.innerHeight
  const numControlPoints = keyframes[0].curve.length

  // write keyframes to 3D data texture.
  // read them into the shaders.

  const keyframesTex = useMemo(() => {
    const kf = new Float32Array(
      keyframes.flatMap((keyframe, i) => {
        return keyframe.curve.flatMap((x, i) => {
          // if (i > 0 && i < keyframe.curve.length - 1) {
          //   x = [
          //     (x[0] + keyframe.curve[i + 1][0]) / 2,
          //     (x[1] + keyframe.curve[i + 1][1]) / 2
          //   ]
          // }
          return [...x, keyframe.thickness[i], 0]
        })
      })
    )

    const keyframesTex = new THREE.Data3DTexture(
      kf,
      numControlPoints,
      1,
      keyframes.length
    )
    keyframesTex.format = THREE.RGBAFormat
    keyframesTex.type = THREE.FloatType
    keyframesTex.minFilter = keyframesTex.magFilter = THREE.LinearFilter
    keyframesTex.wrapR = THREE.ClampToEdgeWrapping
    keyframesTex.unpackAlignment = 1
    keyframesTex.needsUpdate = true
    return keyframesTex
  }, [])

  // const randomTex = useMemo(() => {
  //   return new THREE.DataTexture(Float32Array.from(range(10 * 10).flatMap(x => [Math.random(), Math.random()])), 10, 10, THREE.RGFormat, THREE.FloatType)
  // }, [])

  useFrame(scene => {
    const time = Math.sin((scene.clock.getElapsedTime() % 1) * 1) * 0.5 + 0.5
    meshRef.current.material.uniforms.progress.value = time
    meshRef.current.material.uniformsNeedUpdate = true
  })

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
        uniforms={{
          keyframesTex: { value: keyframesTex },
          count: { value: count },
          progress: { value: 0 },
          jitterSize: { value: jitter.size },
          jitterPosition: { value: jitter.position }
        }}
        vertexShader={
          /*glsl*/ `
          uniform sampler3D keyframesTex;
          uniform float count;
          uniform float progress;
          uniform float jitterSize;
          uniform float jitterPosition;
          out vec2 vUv;
          out float v_test;

          ${multiBezier2(numControlPoints)}
          ${hash}

          void main() {
            vUv = uv;
            // 0.5 - 1.5
            float pointProgress = (float(gl_InstanceID) / (count - 1.));
            v_test = pointProgress;
            float keyframeProgress = (progress + 0.5) * 0.5;
            // int vertex = gl_VertexID;
            vec2[${numControlPoints}] points = vec2[${numControlPoints}](
              ${range(numControlPoints)
                .map(
                  i =>
                    /*glsl*/ `texture(keyframesTex, vec3(${i}. / ${
                      numControlPoints - 1
                    }., 0, keyframeProgress)).xy`
                )
                .join(', ')}
            );
            vec2 thisPosition = 
              // texture(keyframesTex, vec3(pointProgress, 0, keyframeProgress)).xy
              multiBezier2(pointProgress, points)
              // bezier2(pointProgress, points[0], points[1], points[2])
              // points[2]
              + vec2(hash(pointProgress * 2.), hash(pointProgress * 3.)) 
              * jitterPosition;
            float thisThickness = 
              texture(keyframesTex, vec3(pointProgress, 0, keyframeProgress)).z 
              + (hash(pointProgress) - 0.5) 
              * jitterSize;
            
            gl_Position = projectionMatrix 
              * modelViewMatrix 
              * instanceMatrix 
              * (vec4(position * thisThickness, 1) 
              + vec4(thisPosition, 0, 0));
          }`
        }
        fragmentShader={
          /*glsl*/ `
          in vec2 vUv;
          in float v_test;
          void main() {
            if (length(vUv - 0.5) > 0.707 - 0.2) {
              discard;
            }
            gl_FragColor = vec4(v_test, 1, 1, 1);
          }`
        }
      />
    </instancedMesh>
  )
}
