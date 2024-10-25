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

const degree = 2
const targetVector = new THREE.Vector2()

type VectorList = [number, number]
type Vector3List = [number, number, number]
export type BrushSettings = {
  spacing?: number
  size?: VectorList
  alpha?: number
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
  between?: [number, number]
  type?: '2d' | '3d'
  curveLengths: number[]
  controlPointsCount: number
  keyframeCount: number
  pointsTex: THREE.Texture
  colorTex: THREE.Texture
}

export default function Brush(props: ChildProps<BrushSettings, {}, {}>) {
  let {
    spacing = 1,
    alpha = 1,
    curveLengths,
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
    size: [0, 0],
    position: [0, 0],
    hsl: [0, 0, 0],
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
        <planeGeometry args={[size[0], size[1]]}>
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
            keyframeCount: { value: keyframeCount - 1 }
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

${bezier3}
${multiBezier2(controlPointsCount)}
${
  controlPointsCount !== keyframeCount ? multiBezier2(keyframeCount, false) : ''
}
${rotate2d}
${hash}

vec2 processVertex(vec2 position) {
  ${vertexShader}
}

void main() {
  vec2 pixel = 1. / resolution;
  vUv = uv;

  // u to T mapping...
  float keyframeProgress = progress * keyframeCount;
  float curveProgress = pointInfo.y;
  float pointProgress = pointInfo.x;

  #ifdef FORMAT_3D
  vec2[${controlPointsCount}] points;
  for (int i = 0; i < ${controlPointsCount}; i ++) {
    vec2[${keyframeCount}] kfPoints;
    for (int j = 0; j < ${keyframeCount}; j ++) {
      kfPoints[j] = texture(pointsTex, vec3(float(i) / ${controlPointsCount}., curveProgress, float(j) / keyframeCount)).xy;
    }
    points[i] = multiBezier2(progress, kfPoints, vec2(1, 1)).position;
  }
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

  BezierPoint point = multiBezier2(pointProgress, points, resolution);
  v_test = progress;
  vec2 thisPosition = point.position;
  float thisRotation = point.rotation;

  #ifdef FORMAT_3D
  float thickA = texture(
    pointsTex, 
    vec3(pointProgress, curveProgress, floor(keyframeProgress) / keyframeCount)).z;
  float thickB = texture(
    pointsTex, 
    vec3(pointProgress, curveProgress, ceil(keyframeProgress) / keyframeCount)).z;
  float thisThickness = mix(thickA, thickB, fract(keyframeProgress));
  vec4 colorA = texture(
    colorTex, 
    vec3(pointProgress, curveProgress, floor(keyframeProgress) / keyframeCount));
  vec4 colorB = texture(
    colorTex, 
    vec3(pointProgress, curveProgress, ceil(keyframeProgress) / keyframeCount));
  vColor = texture(
    colorTex, 
    vec3(pointProgress, curveProgress, fract(keyframeProgress)));
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
  // gl_FragColor = processColor(vColor, vUv);
  gl_FragColor = processColor(vec4(v_test, 1, 1, 1), vUv);
}`
          }
        />
      </instancedMesh>
    </ChildComponent>
  )
}
