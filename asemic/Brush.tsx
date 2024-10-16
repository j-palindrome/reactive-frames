import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { cloneDeep, last, max, maxBy, range, sum, sumBy } from 'lodash'
import React, { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { multiBezier2 } from '../util/src/shaders/bezier'
import { hash } from '../util/src/shaders/utilities'
import { lerp } from 'three/src/math/MathUtils.js'

export type Point = {
  position: Vector2
  thickness?: number
  alpha?: number
  color?: THREE.Color
}

const degree = 2
const targetVector = new THREE.Vector2()
export type Keyframes = {
  curves: Point[][]
  position?: Vector2
  scale?: Vector2
  rotation?: number
}[]
export type BrushSettings = {
  spacing?: number
  size?: number
  jitter?: {
    size?: number
    position?: Vector2
    hsl?: THREE.Vector3
    a?: number
  }
  position?: Vector2
  scale?: Vector2
  rotation?: number
}
const sampleMatrix = new THREE.Matrix4()
export function Brush({
  keyframes,
  spacing = 0,
  size = 1,
  jitter,
  position = new Vector2(),
  scale = new Vector2(),
  rotation = 0
}: BrushSettings & { keyframes: Keyframes }) {
  jitter = {
    size: 0,
    position: new Vector2(),
    hsl: new THREE.Vector3(),
    a: 0,
    ...jitter
  }

  const resolution = useThree(scene =>
    scene.gl.getDrawingBufferSize(targetVector)
  )

  const meshRef = useRef<
    THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  >(null!)
  const keyframeCount = keyframes.length
  const curveCount = keyframes[0].curves.length
  const controlPointsCount = max(
    keyframes.flatMap(x => x.curves).map(x => x.length)
  )!
  const aspectRatio = window.innerWidth / window.innerHeight
  const subdivisions = (controlPointsCount - degree) / (degree - 1)
  const sampleEachCurve = 100
  const controlPointCount = subdivisions * sampleEachCurve + 1

  let maxLength = 0
  const progress = keyframes.flatMap(x =>
    x.curves.flatMap(curve => {
      // interpolate the bezier curves which are too short
      if (curve.length < controlPointsCount) {
        let i = 0
        while (curve.length < controlPointsCount) {
          curve.splice(i + 1, 0, {
            position: curve[i].position
              .clone()
              .lerp(curve[i + 1].position, 0.5),
            thickness: lerp(
              curve[i].thickness ?? 1,
              curve[i + 1].thickness ?? 1,
              0.5
            ),
            alpha: lerp(curve[i].alpha ?? 1, curve[i + 1].alpha ?? 1, 0.5)
          })
          i += 2
          if (i >= curve.length - 2) i -= curve.length - 2
        }
      }

      const curvePath = new THREE.CurvePath()
      const segments: THREE.Curve<Vector2>[] = []
      range(subdivisions).forEach(i => {
        const thisCurve = new THREE.QuadraticBezierCurve(
          i === 0
            ? curve[i].position
            : curve[i].position.clone().lerp(curve[i + 1].position, 0.5),
          curve[i + 1].position,
          i === subdivisions - 1
            ? curve[i + 2].position
            : curve[i + 1].position.clone().lerp(curve[i + 2].position, 0.5)
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

      return range(controlPointCount).map(progressI => {
        progressI /= controlPointCount - 1
        const thisSegment = curveProgress.find(
          x => x.end >= progressI && x.start <= progressI
        )!
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
        curveCount,
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
      controlPointCount,
      curveCount,
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

    const thisKey = Math.floor(time * keyframes.length)
    const lerpAmount = time * keyframes.length - thisKey
    const thisKeyframe = keyframes[thisKey]
    meshRef.current.position.set(
      ...(thisKeyframe.position ?? position)
        .clone()
        .lerp(keyframes[thisKey + 1].position ?? position, lerpAmount)
        .toArray(),
      0
    )
    meshRef.current.rotation.set(
      0,
      0,
      lerp(
        keyframes[thisKey].rotation ?? rotation,
        keyframes[thisKey + 1].rotation ?? rotation,
        lerpAmount
      )
    )
    meshRef.current.scale.set(
      ...(thisKeyframe.scale ?? scale)
        .clone()
        .lerp(keyframes[thisKey + 1].scale ?? scale, lerpAmount)
        .toArray(),
      1
    )
  })

  const pointProgress = useMemo(() => {
    return Float32Array.from(
      range(curveCount).flatMap(curveI => {
        return range(vertexCount).flatMap(vertexI => {
          const pointProg = vertexI / (vertexCount - 1)
          const curveProg = curveI / (curveCount - 1)
          // sample from middle of pixels
          return [
            pointProg * (1 - 1 / controlPointCount) + 0.5 / controlPointCount,
            curveProg * (1 - 1 / curveCount) + 0.5 / curveCount
          ]
        })
      })
    )
  }, [resolution])

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, vertexCount * curveCount]}
      position={new THREE.Vector3(...position)}
      scale={new THREE.Vector3(...scale)}
      rotation={new THREE.Euler(rotation)}>
      <planeGeometry args={[1, 1 * aspectRatio]}>
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
          pointsTex: { value: pointsTex },
          colorTex: { value: colorTex },
          jitter: { value: jitter },
          resolution: { value: resolution },
          size: { value: size }
        }}
        vertexShader={
          /*glsl*/ `
          struct Jitter {
            float size;
            vec2 position;
            vec3 hsl;
            float a;
          };

          in vec2 pointInfo;

          uniform sampler3D pointsTex;
          uniform sampler3D colorTex;
          uniform sampler3D progressTex;
          uniform float progress;
          uniform float keyframeCount;
          uniform float curveCount;
          uniform vec2 resolution;
          uniform float size;
          uniform Jitter jitter;

          out vec2 vUv;
          out vec4 vColor;
          out float v_test;
          out float discardPoint;

          ${multiBezier2(controlPointsCount)}
          ${hash}

          void main() {
            float brushSize = 1. / resolution.x * size;
            vUv = uv;
            // u to T mapping...
            float keyframeProgress = (progress * (1. - 1. / keyframeCount) + 0.5 / keyframeCount);
            float curveProgress = pointInfo.y;
            float pointProgress = texture(
              progressTex, 
              vec3(
                pointInfo.x, 
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
            // vec2 thisPosition = texture(pointsTex, vec3(pointProgress, curveProgress, keyframeProgress)).xy;
            float thisThickness = texture(
              pointsTex, 
              vec3(
                pointProgress, 
                curveProgress, 
                keyframeProgress)).z;
            vColor = texture(
              colorTex, 
              vec3(
                pointProgress, 
                curveProgress, 
                keyframeProgress));
            
            vec2 jitterPosition = 
              (vec2(hash(thisPosition.x, .184 + progress), hash(thisPosition.y, .182 + progress)) - 0.5) 
              * jitter.position;
            float jitterSize = 
              hash(thisPosition.x + thisPosition.y, 
                .923 + progress)
              * jitter.size;
            float jitterA = vColor.a 
              * (1. - (
                hash(thisPosition.x + thisPosition.y, 
                  .294 + progress) 
                * jitter.a));
            
            gl_Position = 
              projectionMatrix 
              * modelViewMatrix 
              // * instanceMatrix
              * vec4(
                thisPosition 
                + jitterPosition * brushSize
                + position.xy * thisThickness * brushSize * (jitterSize + 1.), 0, 1);
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
