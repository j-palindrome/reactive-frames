import { useFrame, useThree } from '@react-three/fiber'
import { now, range, sumBy } from 'lodash'
import { Ref, RefObject, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Vector2 } from 'three'
import {
  bezier,
  bezierPoint,
  multiBezierProgress,
  multiBezierProgressJS
} from '../../util/src/shaders/bezier'
import { rotate2d } from '../../util/src/shaders/manipulation'
import { hash } from '../../util/src/shaders/utilities'
import { ChildComponent } from '../blocks/FrameChildComponents'
import { ChildProps, TimeOptions } from '../types'
import FeedbackTexture, { FeedbackTextureRef } from './FeedbackTexture'
import { Mesh } from '../frames/CanvasGL'
import Builder from './drawingSystem/Builder'
import { Built } from './drawingSystem/Builder'

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
  recalculate?: boolean | ((progress: number) => number)
  modifyColor?: string
  modifyPosition?: string
}

export default function Brush(
  props: ChildProps<BrushSettings & { keyframes: Built }, {}, {}>
) {
  let {
    spacing = 1,
    defaults,
    jitter,
    flicker,
    modifyColor = /*glsl*/ `return color;`,
    modifyPosition,
    recalculate = false,
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

  const [keyframeData, setKeyframeData] = useState(keyframes.packToTexture())

  const { controlPointCounts, keyframesTex, colorTex, thicknessTex } =
    keyframeData

  const resolution = useThree(state =>
    state.gl.getDrawingBufferSize(targetVector)
  )

  const curveCount = controlPointCounts.length

  const { pointProgress } = useMemo(
    () => keyframes.packToAttributes([window.innerWidth, window.innerHeight]),
    [resolution, curveCount]
  )
  const meshRef = useRef<THREE.Group>(null!)
  const lastProgress = useRef(0)

  return (
    <ChildComponent
      options={{ ...props, ...props.timeOptions }}
      getSelf={() => {
        return meshRef.current
      }}
      defaultDraw={(self, frame, progress, ctx) => {
        const frameTransform = keyframes.data.transform

        if (typeof recalculate === 'function') progress = recalculate(progress)
        if (progress < lastProgress.current && recalculate) {
          keyframes.reInitialize()
          self.children.forEach(c => {
            const cMesh = c as THREE.InstancedMesh<
              THREE.PlaneGeometry,
              THREE.ShaderMaterial
            >
            cMesh.material.uniforms.colorTex.value = keyframes.data.colorTex
            cMesh.material.uniforms.thicknessTex.value =
              keyframes.data.thicknessTex
            cMesh.material.uniforms.keyframesTex.value =
              keyframes.data.keyframesTex
            cMesh.material.uniformsNeedUpdate = true
          })
        }

        lastProgress.current = progress

        self.rotation.set(0, 0, frameTransform.rotate)
        self.scale.set(...frameTransform.scale.toArray(), 1)
        self.position.set(...frameTransform.translate.toArray(), 0)

        self.children.forEach((c, i) => {
          const child = c as THREE.InstancedMesh<
            THREE.PlaneGeometry,
            THREE.ShaderMaterial
          >
          child.material.uniforms.progress.value = progress
          child.material.uniformsNeedUpdate = true
          const transform = keyframes.data.groups[i].transform
          const { translate, scale, rotate } = transform
          const scaleUniform: Vector2 = child.material.uniforms.scale.value
          scaleUniform.set(1, 1).multiply(self.scale).multiply(scale)
          child.position.set(translate.x, translate.y, 0)
          child.scale.set(scale.x, scale.y, 1)
          child.rotation.set(0, 0, rotate)
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
                resolution: { value: resolution },
                jitter: { value: jitter },
                flicker: { value: flicker },
                defaults: { value: defaults },
                progress: { value: 0 },
                keyframesTex: { value: keyframesTex },
                thicknessTex: { value: thicknessTex },
                colorTex: { value: colorTex },
                scale: { value: new Vector2(1, 1) }
              }}
              vertexShader={
                /*glsl*/ `
#define controlPointsCount ${controlPointsCount}.
struct Jitter {
  vec2 size;
  vec2 position;
  vec3 hsl;
  float a;
  float rotation;
};
struct KeyframeInfo {
  float duration;
  float start;
  float strength;
};

in vec2 pointInfo;

uniform sampler2D keyframesTex;
uniform sampler2D thicknessTex;
uniform sampler2D colorTex;
uniform vec2 resolution;
uniform Jitter jitter;
uniform Jitter flicker;
uniform Jitter defaults;
uniform float progress;
uniform vec2 scale;

out vec2 vUv;
out vec4 vColor;
out float v_test;

${rotate2d}
${hash}
${multiBezierProgress}
${bezierPoint}

vec2 modifyPosition(vec2 position) {
  ${modifyPosition ?? 'return position;'}
}
void main() {
  vec2 aspectRatio = vec2(1, resolution.y / resolution.x);
  vec2 pixel = vec2(1. / resolution.x, 1. / resolution.y);
  float pointProgress = pointInfo.x;
  float curveProgress = pointInfo.y;
  vec2 pointCurveProgress = 
    multiBezierProgress(pointProgress, int(controlPointsCount));
  
  vec2 points[3];
  float strength;

  for (float pointI = 0.; pointI < 3.; pointI ++) {
    vec4 samp = texture(
      keyframesTex,
      vec2(
        (pointCurveProgress.x + pointI) 
          / controlPointsCount,
        curveProgress));
    points[int(pointI)] = samp.xy;
    if (pointI == 1.) {
      strength = samp.z;
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
    vec2(pointProgress, curveProgress));
  vColor.a *= 1. 
    - flicker.a
    + hash(1., .385 + progress) * flicker.a;
  float thisThickness = texture(
    thicknessTex, 
    vec2(pointProgress, curveProgress)).x;

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
        position.xy * jitterSize * thisThickness * pixel, 
        point.rotation + 1.5707 + jitterRotation) 
        / aspectRatio / scale),
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
  ${modifyColor}
}
void main() {
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
