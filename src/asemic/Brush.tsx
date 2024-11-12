import { useFrame, useThree } from '@react-three/fiber'
import { range, sumBy } from 'lodash'
import { Ref, RefObject, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Vector2 } from 'three'
import {
  bezier2,
  bezier3,
  bezierPoint,
  multiBezierProgress,
  multiBezierProgressJS
} from '../../util/src/shaders/bezier'
import { rotate2d } from '../../util/src/shaders/manipulation'
import { hash } from '../../util/src/shaders/utilities'
import { ChildComponent } from '../blocks/FrameChildComponents'
import { ChildProps } from '../types'
import FeedbackTexture, { FeedbackTextureRef } from './FeedbackTexture'
import { Mesh } from '../frames/CanvasGL'
import Builder from './drawingSystem/Builder'

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
  keyframes: Builder
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
  return (
    <ChildComponent
      options={{ ...props }}
      getSelf={() => {
        return meshRef.current
      }}
      defaultDraw={(self, frame, progress, ctx) => {
        self.children.forEach((c, i) => {
          const child = c as THREE.InstancedMesh<
            THREE.PlaneGeometry,
            THREE.ShaderMaterial
          >
          child.material.uniforms.progress.value = progress
          child.material.uniformsNeedUpdate = true
          // const { translate, scale, rotate } = keyframes.getGroupTransform(
          //   progress,
          //   i
          // )
          // child.material.uniforms.origin.value = origin

          // if (Math.random() < 0.02) console.log(origin.x, origin.y)

          // child.position.set(translate.x + origin.x, translate.y + origin.y, 0)
          // child.scale.set(scale.x, scale.y, 1)
          // child.rotation.set(0, 0, rotate)
          child.matrixAutoUpdate = true
        })
      }}
      show={self => {
        self.visible = true
      }}
      hide={self => {
        self.visible = false
      }}>
      <group ref={meshRef}>
        {range(pointProgress.length).map(i => (
          <instancedMesh
            key={i}
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
                keyframesTex: { value: keyframesTex },
                jitter: { value: jitter },
                flicker: { value: flicker },
                resolution: { value: resolution },
                defaults: { value: defaults },
                progress: { value: 0 },
                origin: { value: new Vector2(0, 0) }
              }}
              vertexShader={
                /*glsl*/ `
#define keyframesCount ${keyframeCount}.
#define controlPointsCount ${controlPointsCount}.

const bool loop = ${loop ? 'true' : 'false'};
struct Jitter {
  vec2 size;
  vec2 position;
  vec3 hsl;
  float a;
  float rotation;
};

in vec2 pointInfo;

uniform sampler3D keyframesTex;
uniform sampler3D thicknessTex;
uniform sampler3D colorTex;
uniform vec2 resolution;
uniform Jitter jitter;
uniform Jitter flicker;
uniform Jitter defaults;
uniform float progress;
uniform vec2 origin;

out vec2 vUv;
out vec4 vColor;
out float v_test;
out float discardPoint;

${rotate2d}
${hash}
${multiBezierProgress}
${bezierPoint}

vec2 modifyPosition(vec2 position) {
  ${modifyPosition ?? 'return position;'}
}
void main() {
  vec2 aspectRatio = vec2(1, resolution.y / resolution.x);
  float pointProgress = pointInfo.x;
  float curveProgress = pointInfo.y;
  // find progress through keyframes and round to cycles to quadratic bezier based on curve progress
  vec2 pointCurveProgress = 
    multiBezierProgress(pointProgress, int(controlPointsCount));
  vec2 keyframeCurveProgress = 
    multiBezierProgress(progress, 
      loop ? int(keyframesCount) + 2 : int(keyframesCount));
  
  vec2 points[3];
  float thickness;
  float strength;
  for (float pointI = 0.; pointI < 3.; pointI ++) {
    vec4 keyframePoints[3];
    for (int keyframeI = 0; keyframeI < 3; keyframeI ++) {
      float keyframeProgress =
        (keyframeCurveProgress.x + float(keyframeI)) 
        / keyframesCount;
      
      keyframePoints[keyframeI] = texture(
        keyframesTex,
        vec3(
          (pointCurveProgress.x + pointI) 
            / controlPointsCount,   
          curveProgress, 
          keyframeProgress));
    }
    if (loop) {
      keyframePoints[0] = 
        mix(keyframePoints[0], keyframePoints[1], 0.5);
      keyframePoints[2] = 
        mix(keyframePoints[1], keyframePoints[2], 0.5);
    } else {
      if (keyframeCurveProgress.x != keyframesCount - 3.) {
      keyframePoints[2] = 
        mix(keyframePoints[1], keyframePoints[2], 0.5);
      }
      if (keyframeCurveProgress.x != 0.) {
        keyframePoints[0] = 
          mix(keyframePoints[0], keyframePoints[1], 0.5);
      }
    }
    points[int(pointI)] = bezier2(
      keyframeCurveProgress.y,
      keyframePoints[0].xy, 
      keyframePoints[1].xy, 
      keyframePoints[2].xy);
    if (pointI == 1.) {
      // bezier interpolate the strength of the curve
      strength = bezier2(
        keyframeCurveProgress.y,
        vec2(0, keyframePoints[0].z), 
        vec2(0.5, keyframePoints[1].z), 
        vec2(1, keyframePoints[2].z)).y;
    }
  }
  // adjust to interpolate between things
  if (pointCurveProgress.x > 0.) {
    points[0] = mix(points[0], points[1], 0.5);
  } 
  if (pointCurveProgress.x < controlPointsCount - 3.) {
    points[2] = mix(points[1], points[2], 0.5);
  }
  BezierPoint point = bezierPoint(pointCurveProgress.y, 
    points[0], points[1], points[2], strength, aspectRatio);
  
  vColor = texture(
    colorTex, 
    vec3(pointProgress, curveProgress, progress));
  vColor.a *= 1. 
    - flicker.a
    + hash(1., .385 + progress) * flicker.a;
  float thisThickness = texture(
    thicknessTex, 
    vec3(pointProgress, curveProgress, progress)).x;

  vec2 jitterPosition = jitter.position
    * (vec2(hash(point.position.x, .184 + progress), 
      hash(point.position.y, .182 + progress)) - 0.5);
  vec2 flickerPosition = flicker.position
    * vec2(hash(1., .396 + progress), 
      hash(1., .281 + progress));
  vec2 jitterSize = 1. + jitter.size / defaults.size
    * hash(point.position.x + point.position.y, 
      .923 + progress);
  float jitterA = vColor.a 
    * (1. - (
      hash(point.position.x + point.position.y, .294 + progress) 
      * jitter.a));
  float jitterRotation = jitter.rotation
    * hash(point.position.x + point.position.y, .429 + progress)
    - (jitter.rotation / 2.);

  gl_Position = 
    projectionMatrix 
    * modelViewMatrix 
    * vec4(modifyPosition(
      point.position 
      + jitterPosition 
      + flickerPosition
      + rotate2d(
        position.xy * jitterSize * thisThickness, 
        point.rotation + 1.5707 + jitterRotation) 
      / aspectRatio),
      0, 1);
}
`
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
  gl_FragColor = processColor(vec4(v_test, 1, 1, 1), vUv);
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
