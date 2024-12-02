import { useFrame, useThree } from '@react-three/fiber'
import { now, range, sumBy } from 'lodash'
import { Ref, RefObject, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Vector2 } from 'three'
import {
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
  fragmentShader?: string
  recalculate?: boolean | ((progress: number) => number)
  modifyPosition?: string
  keyframes: Builder
}

export default function Brush(props: ChildProps<BrushSettings, {}, {}>) {
  let {
    spacing = 1,
    defaults,
    jitter,
    flicker,
    fragmentShader = /*glsl*/ `return color;`,
    modifyPosition,
    keyframes,
    recalculate = false
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

  const resolution = useThree(state =>
    state.gl.getDrawingBufferSize(targetVector)
  )
  const data = keyframes.reInitialize(resolution)
  const {
    keyframesTex,
    colorTex,
    thicknessTex,
    dimensions,
    groups,
    transform
  } = data

  const meshRef = useRef<THREE.Group>(null!)
  const lastProgress = useRef(0)
  const maxCurveLength = resolution.length() * 2

  return (
    <ChildComponent
      options={{ ...props }}
      getSelf={() => {
        return meshRef.current
      }}
      defaultDraw={(self, frame, progress, ctx) => {
        if (typeof recalculate === 'function') progress = recalculate(progress)
        // if (progress < lastProgress.current && recalculate) {
        if (recalculate) {
          const newData = keyframes.reInitialize(resolution)
          self.rotation.set(0, 0, newData.transform.rotate)
          self.scale.set(...newData.transform.scale.toArray(), 1)
          self.position.set(...newData.transform.translate.toArray(), 0)

          self.children.forEach((c, i) => {
            const child = c as THREE.InstancedMesh<
              THREE.PlaneGeometry,
              THREE.ShaderMaterial
            >
            child.material.uniforms.keyframesTex.value = newData.keyframesTex
            child.material.uniforms.colorTex.value = newData.colorTex
            child.material.uniforms.thicknessTex.value = newData.thicknessTex
            child.material.uniforms.progress.value = progress
            child.material.uniforms.curveLengths.value =
              newData.groups[i].curveLengths
            child.material.uniforms.curveIndexes.value =
              newData.groups[i].curveIndexes
            child.material.uniforms.controlPointCounts.value =
              newData.groups[i].controlPointCounts
            child.material.uniformsNeedUpdate = true
            child.count = groups[i].totalCurveLength

            const { translate, scale, rotate } = data.groups[i].transform
            const scaleUniform: Vector2 = child.material.uniforms.scale.value
            scaleUniform.set(1, 1).multiply(self.scale).multiply(scale)
            child.position.set(translate.x, translate.y, 0)
            child.scale.set(scale.x, scale.y, 1)
            child.rotation.set(0, 0, rotate)
          })
        }
        lastProgress.current = progress
      }}
      show={self => {
        self.visible = true
      }}
      hide={self => {
        self.visible = false
      }}>
      <group
        ref={meshRef}
        scale={[...transform.scale.toArray(), 1]}
        rotation={[0, 0, transform.rotate]}
        position={[...transform.translate.toArray(), 0]}>
        {groups.map((group, i) => (
          <instancedMesh
            position={[...group.transform.translate.toArray(), 0]}
            scale={[...group.transform.scale.toArray(), 1]}
            rotation={[0, 0, group.transform.rotate]}
            key={i}
            args={[undefined, undefined, maxCurveLength]}>
            <planeGeometry args={[defaults.size![0], defaults.size![1]]} />
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
                scale: { value: new Vector2(1, 1) },
                dimensions: { value: dimensions },
                curveLengths: { value: group.curveLengths },
                curveIndexes: { value: group.curveIndexes },
                controlPointCounts: { value: group.controlPointCounts }
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
struct KeyframeInfo {
  float duration;
  float start;
  float strength;
};

uniform sampler2D keyframesTex;
uniform sampler2D thicknessTex;
uniform sampler2D colorTex;
uniform vec2 resolution;
uniform Jitter jitter;
uniform Jitter flicker;
uniform Jitter defaults;
uniform float progress;
uniform vec2 scale;
uniform vec2 dimensions;
uniform int controlPointCounts[${group.controlPointCounts.length}];
uniform int curveLengths[${group.curveLengths.length}];
uniform int curveIndexes[${group.curveIndexes.length}];

out vec2 vUv;
out vec4 vColor;
out float v_test;
// flat out int vDiscard;

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

  int id = gl_InstanceID;
  int totalLength = curveLengths[0];
  int lastLength = 0;
  int curveIndex = 0;
  while (id > totalLength) {
    curveIndex++;
    lastLength = totalLength;
    totalLength += curveLengths[curveIndex];
  }
  float pointProgress = float(id - lastLength) / float(curveLengths[curveIndex]);
  float curveProgress = float(curveIndexes[curveIndex]) / dimensions.y;
  int controlPointsCount = controlPointCounts[curveIndex];
  
  BezierPoint point;
  if (controlPointsCount == 2) {
    vec2 p0 = texture(keyframesTex, vec2(0, curveProgress)).xy;
    vec2 p1 = texture(keyframesTex, vec2(
      1. / dimensions.x, curveProgress)).xy;
    vec2 progressPoint = mix(p0, p1, pointProgress);
    point = BezierPoint(progressPoint,
      atan(progressPoint.y, progressPoint.x));
  } else {
    vec2 pointCurveProgress = 
    multiBezierProgress(pointProgress, controlPointsCount);
    vec2 points[3];
    float strength;
    
    for (float pointI = 0.; pointI < 3.; pointI ++) {
      vec4 samp = texture(
        keyframesTex,
        vec2(
          (pointCurveProgress.x + pointI) 
            / dimensions.x,
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
    if (pointCurveProgress.x < float(controlPointsCount) - 3.) {
      points[2] = mix(points[1], points[2], 0.5);
    }
    point = bezierPoint(pointCurveProgress.y, 
      points[0], points[1], points[2], strength, aspectRatio);
  }
  
  
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
// flat in int vDiscard;

vec4 processColor (vec4 color, vec2 uv) {
  ${fragmentShader}
}
void main() {
  // if (vDiscard == 1) discard;
  gl_FragColor = processColor(vColor, vUv);
  // gl_FragColor = processColor(vec4(v_test, 1,1,1), vUv);
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
