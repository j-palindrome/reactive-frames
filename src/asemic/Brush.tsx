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
  between: [number, number]
}

export default function Brush(
  props: ChildProps<
    BrushSettings & { keyframes: Keyframes['keyframes'] },
    {},
    {}
  >
) {
  let {
    keyframes,
    spacing = 0,
    alpha = 1,
    size = new Vector2(1, 1),
    position = new Vector2(),
    scale = new Vector2(1, 1),
    rotation = 0,
    jitter,
    fragmentShader = /*glsl*/ `return color;`,
    vertexShader = /*glsl*/ `return position;`,
    between = [0, 1]
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
  const keyframeCount = keyframes.length
  const curveCount = keyframes[0].curves.length
  const controlPointsCount = max(
    keyframes.flatMap(x => x.curves).map(x => x.length)
  )!

  const subdivisions = (controlPointsCount - degree) / (degree - 1)
  const curvePoints = 100

  const { progressCurves, vertexCountPerCurve } = useMemo(() => {
    const maxLengthsPerCurve = range(keyframes[0].curves.length).flatMap(
      () => 0
    )

    const keyframeCurves = keyframes.map(keyframe => {
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
        if (length > maxLengthsPerCurve[i]) maxLengthsPerCurve[i] = length
        const start = keyframeLength
        keyframeLength += length
        return {
          curvePath,
          start,
          end: keyframeLength
        }
      })
    })

    const progressCurves = keyframeCurves.flatMap(keyframe =>
      keyframe.flatMap(({ curvePath, start, end }) => {
        const length = end - start
        const curveProgress = curvePath.getCurveLengths().map((x, i) => ({
          end: x / length,
          start: (x - curvePath.curves[i].getLength()) / length,
          index: i
        }))

        return range(curvePoints).map(progressI => {
          progressI /= curvePoints - 1
          const thisSegment =
            curveProgress.find(
              x => x.end >= progressI && x.start <= progressI
            ) ?? last(curveProgress)!
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

    const vertexCountPerCurve = maxLengthsPerCurve.map(
      x => (x * window.innerWidth * devicePixelRatio) / (size.y / 2 + spacing)
    )
    return { progressCurves, vertexCountPerCurve }
  }, [])

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
      Float32Array.from(progressCurves),
      curvePoints,
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
      point => [...(point.color?.toArray() ?? [1, 1, 1]), point.alpha ?? alpha],
      THREE.RGBAFormat
    )
    return { pointsTex, colorTex, progressTex }
  }, [keyframes])

  // curves are sampled according to how long they are
  const pointProgress = useMemo(() => {
    return Float32Array.from(
      range(curveCount).flatMap(curveI => {
        const verticesInCurve = vertexCountPerCurve[curveI]
        return range(verticesInCurve).flatMap(vertexI => {
          const pointProg = vertexI / (verticesInCurve - 1)
          const curveProg = curveI / (curveCount - 1)
          // sample from middle of pixels
          return [
            pointProg * (1 - 1 / curvePoints) + 0.5 / curvePoints,
            curveProg * (1 - 1 / curveCount) + 0.5 / curveCount
          ]
        })
      })
    )
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

    let thisKey = Math.floor(mappedTime * (keyframeCount - 1))
    if (thisKey === keyframeCount - 1 && thisKey > 0) thisKey -= 1
    const lerpAmount = mappedTime * (keyframeCount - 1) - thisKey
    const thisKeyframe = keyframes[thisKey]
    const positionVec = (thisKeyframe.position ?? position)
      .clone()
      .lerp(keyframes[thisKey + 1]?.position ?? position, lerpAmount)
    meshRef.current.position.set(positionVec.x, positionVec.y, 0)
    const rotationRad = lerp(
      keyframes[thisKey].rotation ?? rotation,
      keyframes[thisKey + 1]?.rotation ?? rotation,
      lerpAmount
    )
    meshRef.current.rotation.set(0, 0, rotationRad * 2 * Math.PI)
    const scaleVec = (thisKeyframe.scale ?? scale)
      .clone()
      .lerp(keyframes[thisKey + 1]?.scale ?? scale, lerpAmount)
    meshRef.current.scale.set(scaleVec.x, scaleVec.y, 1)
  }

  return (
    <ChildComponent
      options={{ ...props }}
      getSelf={() => {
        return {}
      }}
      defaultDraw={(self, frame, ctx) => draw(ctx.time)}>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, sum(vertexCountPerCurve)]}>
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
  vec2 size;
  vec2 position;
  vec3 hsl;
  float a;
  float rotation;
};

in vec2 pointInfo;

uniform sampler3D pointsTex;
uniform sampler3D colorTex;
uniform sampler3D progressTex;
uniform float progress;
uniform float keyframeCount;
uniform float curveCount;
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
  float pointProgress = texture(
    progressTex, 
    vec3(
      pointInfo.x, 
      curveProgress, 
      keyframeProgress)).x;
  // float pointProgress = pointInfo.x;

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
  BezierPoint point = multiBezier2(pointProgress, points);
  vec2 thisPosition = point.position;
  float thisRotation = point.rotation;
  float thisThickness = texture(
    pointsTex, 
    vec3(pointProgress, curveProgress, keyframeProgress)).z;
  vColor = texture(
    colorTex, 
    vec3(pointProgress, curveProgress, keyframeProgress));

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
