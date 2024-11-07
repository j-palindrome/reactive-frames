import { useFrame, useThree } from '@react-three/fiber'
import { range, sumBy } from 'lodash'
import { Ref, RefObject, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { bezier3, multiBezier2 } from '../../util/src/shaders/bezier'
import { rotate2d } from '../../util/src/shaders/manipulation'
import { hash } from '../../util/src/shaders/utilities'
import { ChildComponent } from '../blocks/FrameChildComponents'
import { ChildProps } from '../types'
import FeedbackTexture, { FeedbackTextureRef } from './FeedbackTexture'
import { Mesh } from '../frames/CanvasGL'
import { KeyframeBuilder } from './drawingSystem/KeyframeBuilder'

const targetVector = new THREE.Vector2()

type VectorList = [number, number]
type Vector3List = [number, number, number]
export type Jitter = {
  size?: VectorList
  position?: VectorList
  hsl?: Vector3List
  a?: number
  rotation?: number
}
export type BrushSettings = {
  spacing?: number
  defaults?: Jitter
  jitter?: Jitter
  flicker?: Jitter
  position?: VectorList
  scale?: VectorList
  rotation?: number
  fragmentShader?: string
  vertexShader?: string
  modifyPosition?: string
  includes?: string
  loop?: boolean
  keyframes: KeyframeBuilder
}

export default function Brush(props: ChildProps<BrushSettings, {}, {}>) {
  let {
    spacing = 1,
    defaults,
    jitter,
    flicker,
    fragmentShader = /*glsl*/ `return color;`,
    vertexShader = /*glsl*/ `return position;`,
    loop = false,
    modifyPosition,
    includes,
    keyframes
  } = props
  defaults = {
    size: [1, 1],
    hsl: [100, 100, 100],
    a: 100,
    position: [0, 0],
    rotation: 0,
    ...defaults
  }
  jitter = {
    size: [0, 0],
    position: [0, 0],
    hsl: [0, 0, 0],
    a: 0,
    rotation: 0,
    ...jitter
  }
  flicker = {
    size: [0, 0],
    position: [0, 0],
    hsl: [0, 0, 0],
    a: 0,
    rotation: 0,
    ...flicker
  }

  const {
    curveLengths,
    controlPointsCount = 3,
    keyframeCount = 1,
    keyframesTex,
    colorTex,
    thicknessTex
  } = keyframes.packToTexture(defaults)

  const resolution = useThree(state =>
    state.gl.getDrawingBufferSize(targetVector)
  )

  const curveCount = curveLengths.flat().length

  const { pointProgress } = useMemo(() => {
    let curveIndex = 0
    const pointProgress = curveLengths.map(group => {
      const thisPointProgress = Float32Array.from(
        group.flatMap(curveLength => {
          const pointsInCurve =
            (curveLength * resolution.x) / (spacing * defaults.size![0])
          const r = range(pointsInCurve).flatMap(vertexI => {
            const pointProg = vertexI / (pointsInCurve - 1)
            const curveProg = curveIndex / Math.max(1, curveCount - 1)
            // sample from middle of pixels
            return [
              pointProg,
              curveProg * (1 - 1 / curveCount) + 0.5 / curveCount
            ]
          })
          curveIndex++
          return r
        })
      )
      return thisPointProgress
    })
    return { pointProgress }
  }, [resolution, curveCount])

  const meshRef = useRef<THREE.Group>(null!)

  const feedback = useRef<FeedbackTextureRef>({
    texture: new THREE.DataTexture()
  })

  return (
    <ChildComponent
      options={{ ...props }}
      getSelf={() => {
        return meshRef.current
      }}
      defaultDraw={(self, frame, progress, ctx) => {
        self.children.forEach(c => {
          const child = c as THREE.InstancedMesh<
            THREE.PlaneGeometry,
            THREE.ShaderMaterial
          >
          child.material.uniforms.pointsTex.value = feedback.current.texture
          child.material.uniforms.progress.value = progress
          child.material.uniformsNeedUpdate = true
        })
      }}
      show={self => {
        self.visible = true
      }}
      hide={self => {
        self.visible = false
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

          ${loop ? '#define LOOP 1' : ''}

          ${multiBezier2(loop ? keyframeCount + 2 : keyframeCount, {
            endPoints: loop ? false : true
          })}
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
float kfCount = ${keyframeCount}.;
// vec3 lastPoint passed in
vec3[${loop ? keyframeCount + 2 : keyframeCount}] kfPoints;
for (int j = 0; j < ${keyframeCount}; j ++) {
  kfPoints[j] = vec3(texture(keyframesTex, vec3(vUv.x, vUv.y, float(j) / ${keyframeCount}.)).xy, 0);
}

#ifdef LOOP
kfPoints[${keyframeCount}] = vec3(texture(keyframesTex, vec3(vUv.x, vUv.y, 0.)).xy, 0);
kfPoints[${
            keyframeCount + 1
          }] = vec3(texture(keyframesTex, vec3(vUv.x, vUv.y, 1. / kfCount)).xy, 0);
#endif

float thisStrength = mix(texture(keyframesTex, vec3(vUv.x, vUv.y, floor(progress * kfCount) / kfCount)).z, texture(keyframesTex, vec3(vUv.x, vUv.y, ceil(progress * kfCount) / kfCount)).z, fract(progress * kfCount));

vec3 nextKeyframe = vec3(multiBezier2(progress, kfPoints, vec2(1, 1)).position, thisStrength);
${
  modifyPosition
    ? /*glsl*/ `return modifyPosition(lastPoint, nextKeyframe);`
    : /*glsl*/ `return nextKeyframe;`
}
          `
        }
      />
      <group ref={meshRef}>
        {range(pointProgress.length).map(i => (
          <instancedMesh
            args={[undefined, undefined, pointProgress[i].length / 2]}>
            <planeGeometry args={[defaults.size![0], defaults.size![1]]}>
              <instancedBufferAttribute
                attach='attributes-pointInfo'
                args={[pointProgress[i], 2]}
              />
            </planeGeometry>
            <shaderMaterial
              transparent
              uniforms={{
                colorTex: { value: colorTex },
                thicknessTex: { value: thicknessTex },
                pointsTex: { value: feedback.current.texture },
                jitter: { value: jitter },
                flicker: { value: flicker },
                resolution: { value: resolution },
                defaults: { value: defaults },
                progress: { value: 0 }
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
uniform sampler3D thicknessTex;
uniform sampler3D colorTex;
uniform vec2 resolution;
uniform Jitter jitter;
uniform Jitter flicker;
uniform Jitter defaults;
uniform float progress;

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
  vec2 grid = vec2(100, 100);
  vUv = uv;

  // u to T mapping...
  float curveProgress = pointInfo.y;
  float pointProgress = pointInfo.x;

  vec3[${controlPointsCount}] points = vec3[${controlPointsCount}](
    ${range(controlPointsCount)
      .map(
        i =>
          /*glsl*/ `texture(pointsTex, vec2(${i}. / ${
            controlPointsCount - 1
          }., curveProgress)).xyz`
      )
      .join(', ')}
  );

  BezierPoint point = multiBezier2(pointProgress, points, resolution);
  vec2 thisPosition = point.position;
  float thisRotation = point.rotation;
  
  vColor = texture(
    colorTex, 
    vec3(pointProgress, curveProgress, progress));
  vColor.a *= 1. 
    - flicker.a / grid.x
    + hash(1., .385 + progress) * flicker.a / grid.x;
  float thisThickness = texture(
    thicknessTex, 
    vec3(pointProgress, curveProgress, progress)).x;

  vec2 jitterPosition = jitter.position * pixel
    * (vec2(hash(thisPosition.x, .184 + progress), 
      hash(thisPosition.y, .182 + progress)) - 0.5);
  vec2 flickerPosition = flicker.position / grid.x * vec2(hash(1., .396 + progress), hash(1., .281 + progress));
  vec2 jitterSize = 1. + jitter.size / defaults.size
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
      thisPosition 
      + jitterPosition 
      + flickerPosition
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
        ))}
      </group>
    </ChildComponent>
  )
}

function DisplayTexture({
  map
}: {
  map: RefObject<{ texture: THREE.Texture }>
}) {
  const displayRef = useRef<
    THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  >(null!)
  useFrame(() => {
    displayRef.current.material.map = map.current?.texture ?? null
    displayRef.current.material.needsUpdate = true
  })
  return (
    <mesh ref={displayRef} position={[0.5, 0.5, 0]}>
      <planeGeometry />
      <meshBasicMaterial />
    </mesh>
  )
}
