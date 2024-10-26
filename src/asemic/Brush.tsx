import { useThree } from '@react-three/fiber'
import { range } from 'lodash'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { bezier3, multiBezier2 } from '../../util/src/shaders/bezier'
import { rotate2d } from '../../util/src/shaders/manipulation'
import { hash } from '../../util/src/shaders/utilities'
import { ChildComponent } from '../blocks/FrameChildComponents'
import { ChildProps } from '../types'
import FeedbackTexture, { FeedbackTextureRef } from './FeedbackTexture'

const targetVector = new THREE.Vector2()

type VectorList = [number, number]
type Vector3List = [number, number, number]
export type BrushSettings = {
  spacing?: number
  size?: VectorList
  jitter?: {
    size?: VectorList
    position?: VectorList
    hsl?: Vector3List
    a?: number
    rotation?: number
  }
  position?: VectorList
  scale?: VectorList
  rotation?: number
  fragmentShader?: string
  vertexShader?: string
  modifyPosition?: string
  includes?: string
  between?: [number, number]
  curveLengths: number[]
  controlPointsCount: number
  keyframeCount: number
  keyframesTex: THREE.Data3DTexture
  colorTex: THREE.Texture
  loop?: boolean
}

export default function Brush(props: ChildProps<BrushSettings, {}, {}>) {
  let {
    spacing = 1,
    curveLengths,
    controlPointsCount = 3,
    keyframeCount = 1,
    keyframesTex,
    colorTex,
    size = new Vector2(1, 1),
    position = new Vector2(),
    scale = new Vector2(1, 1),
    rotation = 0,
    jitter,
    fragmentShader = /*glsl*/ `return color;`,
    vertexShader = /*glsl*/ `return position;`,
    between = [0, 1],
    loop = false,
    modifyPosition,
    includes
  } = props
  jitter = {
    size: [0, 0],
    position: [0, 0],
    hsl: [0, 0, 0],
    a: 0,
    rotation: 0,
    ...jitter
  }

  const resolution = useThree(state =>
    state.gl.getDrawingBufferSize(targetVector)
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
        const pointsInCurve = (curveLength * resolution.x) / (spacing * size[0])

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
  }, [resolution, curveCount])

  const feedback = useRef<FeedbackTextureRef>({
    texture: new THREE.DataTexture()
  })

  const draw = (progress: number) => {
    if (progress < between[0] || progress > between[1]) {
      meshRef.current.visible = false
      return
    } else {
      meshRef.current.visible = true
    }

    // const mappedTime = (progress - between[0]) / (between[1] - between[0])

    // meshRef.current.material.uniforms.progress.value = mappedTime
    meshRef.current.material.uniforms.pointsTex.value = feedback.current.texture
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

  return (
    <ChildComponent
      options={{ ...props }}
      getSelf={() => {
        return {}
      }}
      defaultDraw={(self, frame, ctx) => {
        draw(ctx.time)
      }}>
      <FeedbackTexture
        name={`${props.name}-pointsTex`}
        ref={feedback}
        width={controlPointsCount}
        height={curveCount}
        uniforms={{
          keyframesTex: { value: keyframesTex },
          progress: { value: 0 }
        }}
        includes={
          /*glsl*/ `
          uniform sampler3D keyframesTex;
          uniform float mixFactor;
          ${loop ? `#define LOOP 1` : ''}

          ${multiBezier2(loop ? keyframeCount + 2 : keyframeCount)}
          ${includes ?? ''}
          ${
            modifyPosition
              ? /*glsl*/ `
          vec3 modifyPosition(vec3 lastPoint, vec3 thisPoint) {
            ${modifyPosition}
          }`
              : ''
          }
        `
        }
        fragmentShader={
          /*glsl*/ `
          // vec3 lastPoint passed in
          vec2[${loop ? keyframeCount + 2 : keyframeCount}] kfPoints;
          for (int j = 0; j < ${keyframeCount}; j ++) {
            kfPoints[j] = texture(keyframesTex, vec3(vUv.x, vUv.y, float(j) / ${keyframeCount}.)).xy;
          }
          
          #ifdef LOOP
          kfPoints[${keyframeCount}] = texture(keyframesTex, vec3(vUv.x, vUv.y, 0.)).xy;
          kfPoints[${
            keyframeCount + 1
          }] = texture(keyframesTex, vec3(vUv.x, vUv.y, 1. / ${keyframeCount}.)).xy;
          #endif

          vec3 nextKeyframe = vec3(multiBezier2(progress, kfPoints, vec2(1, 1)).position, 1);
          ${
            modifyPosition
              ? /*glsl*/ `return modifyPosition(lastPoint, nextKeyframe);`
              : /*glsl*/ `return nextKeyframe;`
          }
          `
        }
      />
      <instancedMesh ref={meshRef} args={[undefined, undefined, pointCount]}>
        <planeGeometry args={[size[0], size[1]]}>
          <instancedBufferAttribute
            attach='attributes-pointInfo'
            args={[pointProgress, 2]}
          />
        </planeGeometry>
        <shaderMaterial
          transparent
          uniforms={{
            colorTex: { value: colorTex },
            pointsTex: { value: feedback.current.texture },
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

uniform sampler2D pointsTex;
uniform sampler3D colorTex;
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
  float curveProgress = pointInfo.y;
  float pointProgress = pointInfo.x;

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

  BezierPoint point = multiBezier2(pointProgress, points, resolution);
  vec2 thisPosition = point.position;
  float thisRotation = point.rotation;
  
  vColor = texture(
    colorTex, 
    vec3(pointProgress, curveProgress, 0));
  float thisThickness = texture(
    pointsTex, 
    vec2(pointProgress, curveProgress)).z;

  vec2 jitterPosition = jitter.position * pixel
    * (vec2(hash(thisPosition.x, .184), 
      hash(thisPosition.y, .182)) - 0.5);
  vec2 jitterSize = 1. + jitter.size / size
    * hash(thisPosition.x + thisPosition.y, .923);
  float jitterA = vColor.a 
    * (1. - (
      hash(thisPosition.x + thisPosition.y, .294) 
      * jitter.a));
  float jitterRotation = jitter.rotation
    * hash(thisPosition.x + thisPosition.y, .429)
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
  // gl_FragColor = processColor(vColor, vUv);
  gl_FragColor = processColor(vColor, vUv);
}`
          }
        />
      </instancedMesh>
    </ChildComponent>
  )
}
