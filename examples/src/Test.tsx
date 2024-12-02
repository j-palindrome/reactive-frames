import Builder from '../../src/asemic/drawingSystem/Builder'
import { rotate2d } from '../../src/utilities/shaders'
import { bezierPoint, multiBezierProgress } from '../../util/src/shaders/bezier'
import { Canvas, useThree } from '@react-three/fiber'
import { last, max, range, sum } from 'lodash'
import { RGBAFormat } from 'three'
import { ClampToEdgeWrapping } from 'three'
import { LinearFilter } from 'three'
import { Vector2 } from 'three'
import { FloatType } from 'three'
import { NearestFilter } from 'three'
import { RepeatWrapping } from 'three'
import { AnyPixelFormat } from 'three'
import { DataTexture } from 'three'

export default function Test() {
  return (
    <Canvas>
      <Scene />
    </Canvas>
  )
}
const targetVector = new Vector2()
function Scene() {
  // const curveEnds = [100, 500, 900]

  // const totalCurves = last(curveEnds)!
  // const curves = [
  //   [
  //     [0.5, 0.25],
  //     [0.5, 0.75]
  //   ],
  //   [
  //     [0, 0],
  //     [0.5, 0.5],
  //     [1, 1]
  //   ],
  //   [
  //     [0, 0],
  //     [0.5, 0.25],
  //     [1, 0.5],
  //     [1, 0]
  //   ]
  // ]
  // const controlPointCounts = curves.map(x => x.length)
  // const width = max(curves.map(x => x.length))!
  // const height = curves.length
  // const createTexture = (array: Float32Array, format: AnyPixelFormat) => {
  //   const tex = new DataTexture(array, width, height)
  //   tex.format = format
  //   tex.type = FloatType
  //   tex.minFilter = tex.magFilter = NearestFilter
  //   tex.wrapS = ClampToEdgeWrapping
  //   tex.wrapT = ClampToEdgeWrapping
  //   tex.needsUpdate = true
  //   return tex
  // }

  // const keyframesTex = createTexture(
  //   new Float32Array(
  //     curves.flatMap(c =>
  //       range(width).flatMap(i => {
  //         return c[i] ? [c[i][0], c[i][1], 0, 1] : [0, 0, 0, 0]
  //       })
  //     )
  //   ),
  //   RGBAFormat
  // )

  const resolution = useThree(state =>
    // @ts-ignore
    state.gl.getDrawingBufferSize(targetVector)
  )

  const data = new Builder(g => g.text('e')).reInitialize(resolution)

  // repeatWrapping causes an issue...
  return (
    <instancedMesh
      args={[undefined, undefined, data.groups[0].totalCurveLength]}>
      <planeGeometry />
      <shaderMaterial
        uniforms={{
          keyframesTex: { value: data.keyframesTex },
          colorTex: { value: data.colorTex },
          thicknessTex: { value: data.thicknessTex },
          dimensions: { value: data.dimensions },
          curveEnds: { value: data.groups[0].curveEnds },
          controlPointCounts: { value: data.groups[0].controlPointCounts },
          resolution: { value: resolution }
        }}
        vertexShader={
          /*glsl*/ `
uniform int curveEnds[${data.groups[0].curveEnds.length}];
uniform int controlPointCounts[${data.groups[0].curveEnds.length}];
uniform sampler2D keyframesTex;
uniform vec2 dimensions;
uniform vec2 resolution;

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
    curveIndex ++;
  }

  float curveProgress = float(curveIndex) / dimensions.y;
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

  
  // vColor = texture(
  //   colorTex, 
  //   vec2(pointProgress, curveProgress));
  // float thisThickness = texture(
  //   thicknessTex, 
  //   vec2(pointProgress, curveProgress)).x;
  
  // gl_Position = vec4(position * 5. / totalCurves + vec3(pointProgress * 2. - 1., -curveProgress * 0.1, 0), 1);
  gl_Position = 
  projectionMatrix 
  * modelViewMatrix 
  * vec4(modifyPosition(
    point.position 
    + rotate2d(
      position.xy * pixel, 
      point.rotation + 1.5707) 
      / aspectRatio * 10.),
    0, 1);
}`
        }
        fragmentShader={
          /*glsl*/ `
in float v_test;
void main() {
  gl_FragColor = vec4(v_test, 1, 1, 1);
}`
        }
      />
    </instancedMesh>
  )
}
