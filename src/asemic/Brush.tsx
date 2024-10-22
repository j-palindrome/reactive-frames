import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { cloneDeep, last, max, maxBy, range, sum, sumBy } from 'lodash'
import React, { useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { multiBezier2 } from '../../util/src/shaders/bezier'
import { hash } from '../../util/src/shaders/utilities'
import { lerp } from 'three/src/math/MathUtils.js'
import { rotate2d } from '../../util/src/shaders/manipulation'
import Keyframes from './Keyframes'
import { ChildProps } from '../types'
import { ChildComponent } from '../blocks/FrameChildComponents'
import { Fbo } from '@react-three/drei'
import KeyframeRender from './KeyframeRender'

const degree = 2
const targetVector = new THREE.Vector2()

export type BrushSettings = {
  spacing?: number
  size?: Vector2
  alpha?: number
  jitter?: {
    size?: Vector2
    position?: Vector2
    hsl?: THREE.Vector3
    a?: number
    rotation?: number
  }
  position?: Vector2
  scale?: Vector2
  rotation?: number
  fragmentShader?: string
  vertexShader?: string
  between?: [number, number]
  type?: '2d' | '3d'
  curveLengths: number[]
  controlPointsCount: number
  keyframeCount: number
  pointsTex: THREE.Texture
  colorTex: THREE.Texture
}

export function useKeyframes({
  keyframes
}: {
  keyframes: Keyframes['keyframes']
}) {
  const keyframeCount = keyframes.length
  const curveCount = keyframes[0].curves.length

  const controlPointsCount = max(
    keyframes.flatMap(x => x.curves).map(x => x.length)
  )!

  const subdivisions = (controlPointsCount - degree) / (degree - 1)
  const curveLengths = useMemo(() => {
    const lengthsPerCurve = range(keyframes[0].curves.length).flatMap(() => 0)

    keyframes.forEach(keyframe => {
      let keyframeLength = 0
      return keyframe.curves.map((curve, i) => {
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

        // We sample each curve according to its maximum keyframe length
        if (length > lengthsPerCurve[i]) lengthsPerCurve[i] = length
        keyframeLength += length
      })
    })

    return lengthsPerCurve
  }, [])

  // write keyframes to 3D data texture.
  // read them into the shaders.

  const { pointsTex, colorTex } = useMemo(() => {
    const createTexture = (
      getPoint: (point: CurvePoint) => number[],
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

    const pointsTex = createTexture(point => {
      return [...point.position.toArray(), point.thickness ?? 1, 0]
    }, THREE.RGBAFormat)

    const colorTex = createTexture(
      point => [...(point.color?.toArray() ?? [1, 1, 1]), point.alpha ?? 1],
      THREE.RGBAFormat
    )
    return { pointsTex, colorTex }
  }, [keyframes])

  return {
    curveLengths,
    pointsTex,
    colorTex,
    controlPointsCount,
    keyframeCount,
    type: '3d' as '3d'
  }
}

export default function Brush(props: ChildProps<BrushSettings, {}, {}>) {
  let {
    spacing = 0,
    alpha = 1,
    curveLengths = [10],
    controlPointsCount = 3,
    keyframeCount = 1,
    pointsTex,
    colorTex,
    size = new Vector2(1, 1),
    position = new Vector2(),
    scale = new Vector2(1, 1),
    rotation = 0,
    jitter,
    fragmentShader = /*glsl*/ `return color;`,
    vertexShader = /*glsl*/ `return position;`,
    between = [0, 1],
    type = '2d'
  } = props
  jitter = {
    size: new Vector2(0, 0),
    position: new Vector2(0, 0),
    hsl: new THREE.Vector3(0, 0, 0),
    a: 0,
    rotation: 0,
    ...jitter
  }

  const resolution = useThree(scene =>
    scene.gl.getDrawingBufferSize(targetVector)
  )

  const meshRef = useRef<
    THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  >(null!)

  // curves are sampled according to how long they are
  const curveCount = curveLengths.length

  const { pointProgress, pointCount } = useMemo(() => {
    let pointCount = 0
    const pointProgress = Float32Array.from(
      curveLengths.flatMap((curveLength, curveI) => {
        const pointsInCurve = (curveLength * resolution.x) / (size.y + spacing)
        pointCount += pointsInCurve
        return range(pointsInCurve).flatMap(vertexI => {
          const pointProg = vertexI / (pointsInCurve - 1)
          const curveProg = curveI / Math.max(1, curveCount - 1)
          // sample from middle of pixels
          return [
            pointProg,
            curveProg * (1 - 1 / curveCount) + 0.5 / curveCount
          ]
        })
      })
    )
    return { pointProgress, pointCount }
  }, [resolution])

  const draw = (progress: number) => {
    if (progress < between[0] || progress > between[1]) {
      meshRef.current.visible = false
      return
    } else {
      meshRef.current.visible = true
    }

    const mappedTime = (progress - between[0]) / (between[1] - between[0])

    meshRef.current.material.uniforms.progress.value = mappedTime
    meshRef.current.material.uniformsNeedUpdate = true

    // let thisKey = Math.floor(mappedTime * (keyframeCount - 1))
    // if (thisKey === keyframeCount - 1 && thisKey > 0) thisKey -= 1
    // const lerpAmount = mappedTime * (keyframeCount - 1) - thisKey
    // const thisKeyframe = keyframes[thisKey]
    // const positionVec = (thisKeyframe.position ?? position)
    //   .clone()
    //   .lerp(keyframes[thisKey + 1]?.position ?? position, lerpAmount)
    // meshRef.current.position.set(positionVec.x, positionVec.y, 0)
    // const rotationRad = lerp(
    //   keyframes[thisKey].rotation ?? rotation,
    //   keyframes[thisKey + 1]?.rotation ?? rotation,
    //   lerpAmount
    // )
    // meshRef.current.rotation.set(0, 0, rotationRad * 2 * Math.PI)
    // const scaleVec = (thisKeyframe.scale ?? scale)
    //   .clone()
    //   .lerp(keyframes[thisKey + 1]?.scale ?? scale, lerpAmount)
    // meshRef.current.scale.set(scaleVec.x, scaleVec.y, 1)
  }

  console.log(pointProgress)

  return (
    <ChildComponent
      options={{ ...props }}
      getSelf={() => {
        return {}
      }}
      defaultDraw={(self, frame, ctx) => {
        draw(ctx.time)
      }}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, pointCount]}>
        <planeGeometry args={[size.x, size.y]}>
          <instancedBufferAttribute
            attach='attributes-pointInfo'
            args={[pointProgress, 2]}
          />
        </planeGeometry>
        <shaderMaterial
          transparent
          uniforms={{
            progress: { value: 0 },
            pointsTex: { value: pointsTex },
            colorTex: { value: colorTex },
            jitter: { value: jitter },
            resolution: { value: resolution },
            size: { value: size },
            keyframeCount: { value: keyframeCount }
          }}
          vertexShader={
            /*glsl*/ `
#define FORMAT_3D 1
struct Jitter {
  vec2 size;
  vec2 position;
  vec3 hsl;
  float a;
  float rotation;
};

in vec2 pointInfo;

#ifdef FORMAT_3D
uniform sampler3D pointsTex;
uniform sampler3D colorTex;
uniform float progress;
uniform float keyframeCount;
#endif
#ifdef FORMAT_2D
uniform sampler2D pointsTex;
uniform sampler2D colorTex;
#endif

uniform vec2 resolution;
uniform vec2 size;
uniform Jitter jitter;

out vec2 vUv;
out vec4 vColor;
out float v_test;
out float discardPoint;

${multiBezier2(controlPointsCount)}
${rotate2d}
${hash}

vec2 processVertex(vec2 position) {
  ${vertexShader}
}

void main() {
  vec2 pixel = 1. / resolution;
  vUv = uv;

  // u to T mapping...
  float keyframeProgress = (progress * (1. - 1. / keyframeCount) + 0.5 / keyframeCount);
  float curveProgress = pointInfo.y;
  float pointProgress = pointInfo.x;

  #ifdef FORMAT_3D
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
  #endif
  #ifdef FORMAT_2D
  vec2[${controlPointsCount}] points = vec2[${controlPointsCount}](
    ${range(controlPointsCount)
      .map(
        i =>
          /*glsl*/ `texture(pointsTex, vec2(${i}. / ${
            controlPointsCount - 1
          }., curveProgress)).xy`
      )
      .join(', ')}
  );
  #endif

  BezierPoint point = multiBezier2(pointProgress, points);
  vec2 thisPosition = point.position;
  float thisRotation = point.rotation;

  #ifdef FORMAT_3D
  float thisThickness = texture(
    pointsTex, 
    vec3(pointProgress, curveProgress, keyframeProgress)).z;
  vColor = texture(
    colorTex, 
    vec3(pointProgress, curveProgress, keyframeProgress));
  #endif
  #ifdef FORMAT_2D
  float thisThickness = texture(
    pointsTex, 
    vec2(pointProgress, curveProgress)).z;
  vColor = texture(
    colorTex, 
    vec2(pointProgress, curveProgress));
  #endif

  vec2 jitterPosition = jitter.position * pixel
    * (vec2(hash(thisPosition.x, .184 + progress), 
      hash(thisPosition.y, .182 + progress)) - 0.5);
  vec2 jitterSize = 1. + jitter.size / size
    * hash(thisPosition.x + thisPosition.y, .923 + progress);
  float jitterA = vColor.a 
    * (1. - (
      hash(thisPosition.x + thisPosition.y, .294 + progress) 
      * jitter.a));
  float jitterRotation = jitter.rotation
    * hash(thisPosition.x + thisPosition.y, .429 + progress)
    - (jitter.rotation / 2.);

  gl_Position = 
    projectionMatrix 
    * modelViewMatrix 
    // * instanceMatrix
    * vec4(processVertex(
      thisPosition + jitterPosition
      + rotate2d(
        position.xy * jitterSize * thisThickness, 
        thisRotation + 1.5707 + jitterRotation) * pixel),
      0, 1);
}`
          }
          fragmentShader={
            /*glsl*/ `
uniform float progress;
uniform vec2 resolution;
in vec2 vUv;
in vec4 vColor;
in float v_test;

vec4 processColor (vec4 color, vec2 uv) {
  ${fragmentShader}
}
void main() {
  // if (discardPoint == 1.) discard;
  // if (length(vUv - 0.5) > 0.707 - 0.2) discard;
  gl_FragColor = processColor(vColor, vUv);
}`
          }
        />
      </instancedMesh>
    </ChildComponent>
  )
}
