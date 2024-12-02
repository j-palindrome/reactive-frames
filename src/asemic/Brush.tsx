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
  recalculate?: boolean | ((progress: number) => number)
  modifyPosition?: string
  modifyColor?: string
  keyframes: Builder
}

export default function Brush(props: ChildProps<BrushSettings, {}, {}>) {
  let {
    spacing = 1,
    defaults,
    modifyPosition,
    modifyColor = `return color;`,
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

  const resolution = useThree(state =>
    state.gl.getDrawingBufferSize(targetVector)
  )
  const data = keyframes.reInitialize(resolution)
  const {
    keyframesTex,
    colorTex,
    thicknessTex,
    groups,
    transform,
    dimensions
  } = data

  const meshRef = useRef<THREE.Group>(null!)
  const lastProgress = useRef(0)
  const maxCurveLength = resolution.length()

  return (
    <ChildComponent
      options={{ ...props }}
      getSelf={() => {
        return meshRef.current
      }}
      defaultDraw={(self, frame, progress, ctx) => {
        if (typeof recalculate === 'function') progress = recalculate(progress)
        if (progress < lastProgress.current && recalculate) {
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
            child.material.uniforms.curveEnds.value =
              newData.groups[i].curveEnds
            child.material.uniforms.curveIndexes.value =
              newData.groups[i].curveIndexes
            child.material.uniforms.controlPointCounts.value =
              newData.groups[i].controlPointCounts
            child.material.uniformsNeedUpdate = true
            child.material.uniforms.dimensions.value = data.dimensions

            child.count = groups[i].totalCurveLength

            const { translate, scale, rotate } = data.groups[i].transform
            child.material.uniforms.scaleCorrection.value = scale
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
            <planeGeometry
              args={[defaults.size![0], defaults.size![1]]}></planeGeometry>
            <shaderMaterial
              transparent
              uniforms={{
                colorTex: { value: colorTex },
                thicknessTex: { value: thicknessTex },
                keyframesTex: { value: keyframesTex },
                resolution: { value: resolution },
                progress: { value: 0 },
                dimensions: { value: dimensions },
                curveEnds: { value: group.curveEnds },
                curveIndexes: { value: group.curveIndexes },
                controlPointCounts: { value: group.controlPointCounts },
                scaleCorrection: { value: group.transform.scale }
              }}
              vertexShader={
                /*glsl*/ `
uniform int curveEnds[${group.curveEnds.length}];
uniform int controlPointCounts[${group.controlPointCounts.length}];
uniform int curveIndexes[${group.curveIndexes.length}];
uniform sampler2D keyframesTex;
uniform vec2 dimensions;
uniform vec2 resolution;
uniform vec2 scaleCorrection;

out vec2 vUv;
out vec4 vColor;
out float v_test;

${bezierPoint}
${multiBezierProgress}
${rotate2d}
vec2 modifyPosition(vec2 position) {
  ${'return position;'}
}

void main() {
  vec2 aspectRatio = vec2(1, resolution.y / resolution.x);
  vec2 pixel = vec2(1. / resolution.x, 1. / resolution.y);

  int id = gl_InstanceID;
  int curveIndex = 0;
  while (id > curveEnds[curveIndex]) {
    if (curveIndex >= curveEnds.length()) {
      break;
    }
    curveIndex ++;
  }

  float curveProgress = float(curveIndexes[curveIndex]) / dimensions.y;
  int controlPointsCount = controlPointCounts[curveIndex];

  float pointProgress;
  if (curveIndex > 0) {
    pointProgress = float(id - curveEnds[curveIndex - 1]) 
      / float(curveEnds[curveIndex] - curveEnds[curveIndex - 1]);
  } else {
    pointProgress = float(id) / float(curveEnds[curveIndex]);
  }
  if (pointProgress < 0.5) v_test = 1.;

  BezierPoint point;
  if (controlPointsCount == 2) {
    vec2 p0 = texture(keyframesTex, vec2(0, curveProgress)).xy;
    vec2 p1 = texture(keyframesTex, vec2(
      1. / dimensions.x, curveProgress)).xy;
    vec2 progressPoint = mix(p0, p1, pointProgress);
    // vec2 progressPoint = mix(vec2(0.5, 0.25), vec2(0.5, 0.75), pointProgress);
    point = BezierPoint(progressPoint,
      atan(progressPoint.y, progressPoint.x));
  } else {
    vec2 pointCurveProgress = 
      multiBezierProgress(pointProgress, controlPointsCount);
    vec2 points[3];
    float strength;
    
    for (int pointI = 0; pointI < 3; pointI ++) {
      vec4 samp = texture(
        keyframesTex,
        vec2(
          (pointCurveProgress.x + float(pointI)) 
            / dimensions.x,
          curveProgress));
      points[pointI] = samp.xy;
      if (pointI == 1) {
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
      points[0], points[1], points[2], strength, vec2(1, 1));
  }

  gl_Position = 
    projectionMatrix 
    * modelViewMatrix 
    * vec4(modifyPosition(
      point.position 
      + rotate2d(
        position.xy * pixel, 
        point.rotation + 1.5707) 
        / aspectRatio 
        / scaleCorrection),
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
  ${modifyColor}
}
void main() {
  // if (vDiscard == 1) discard;
  // gl_FragColor = processColor(vColor, vUv);
  gl_FragColor = processColor(vec4(v_test, 1,1,1), vUv);
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
