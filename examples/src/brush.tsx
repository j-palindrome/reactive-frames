import {
  PI,
  defaultFragColor,
  defaultVert2D,
  hash
} from '../util/src/shaders/utilities'
import { Reactive, CanvasGL } from '../../src'
import { Mesh } from '../../src/frames/CanvasGL'
import { range } from 'lodash'
import { arc, arcTangent } from '../util/src/geometry/geometry'
import { rad } from '../util/src/shaders/manipulation'
import { rad as radFunc } from '../util/src/math'
import { generateShape } from '../../asemic/mesh'
import * as twgl from 'twgl.js'
import { shape, toAngle } from '../util/src/geometry/geometry'
import { rotate2d } from '../../src/utilities/shaders'

export default function App() {
  const count = 1000
  return (
    <Reactive className='h-screen w-screen'>
      <CanvasGL name='canvas'>
        <Mesh
          name='mesh'
          instanceCount={count}
          attributes={{
            points: {
              numComponents: 2,
              data: range(count).flatMap(x =>
                arc(radFunc(x / count / 2 + 0.75), [0, -1], [0.8, 1.8])
              ),

              divisor: 1
              // data: [0, 0]
            },
            rotation: {
              numComponents: 1,
              data: range(count).flatMap(x =>
                toAngle(arcTangent(radFunc(x / count / 2 + 0.75), [0.8, 1.8]))
              ),
              divisor: 1
            },
            vertex: {
              numComponents: 2,
              data: generateShape('squareCenter')
            },
            ...twgl.primitives.createXYQuadVertices(1)
          }}
          vertexShader={
            /*glsl*/ `
            in vec2 points;
            in float rotation;
            in vec3 position;
            in vec2 heading;
            in vec2 vertex;
            in vec2 texcoord;
            out vec2 uv;
            out float instance;
            uniform float size;
            uniform vec2 resolution;
            uniform float jitterBias;
            uniform float rotationJitter;
            uniform float positionJitter;
            uniform float sizeJitter;
            ${hash}
            ${rotate2d}
            ${PI}
            void main() {
              instance = float(gl_InstanceID);
              float pointSize = size / resolution.x;
              float jitterHash = hash(points.x);
              float jitterSign = hash(points.x + 3.1432);
              if (jitterSign > 0.5) jitterSign = 1.0;
              else jitterSign = -1.0;

              gl_Position = vec4(
                rotate2d(position.xy * (pointSize + (hash(points.x + 0.8241) - 0.5) * sizeJitter * pointSize)
                + vec2(pow(jitterHash, (1.0 + jitterBias)) * jitterSign) * (positionJitter * pointSize), 
                  -rotation + (hash(points.x + 1.2341) - 0.5) * rotationJitter * PI) 
                + points, 0, 1);
              uv = texcoord;
            }`
          }
          fragmentShader={
            /*glsl*/ `
            in vec2 uv;
            in float instance;
            uniform float time;
            uniform float count;
            ${PI}
            ${rad}
            void main() {
              if (time * 2.0 < instance / count || (time * 2.0 > 1.0 && time * 2.0 - 1.0 > instance / count)) discard;
              // fragColor = vec4(1, 1, 1, 1);
              // return;
              float func2 = sin(rad(uv.x) * 9.0);
              float func1 = sin(rad(uv.x + 0.43) * 11.0) * sin(rad(uv.x));
              if (func1 > 0.0 && func2 > 0.0) discard;
              else fragColor = vec4(1, 1, 1, (func1 + func2) * 0.5);
              // fragColor = vec4(1, 1, 1, sin(gl_PointCoord.x * PI * 2.0 * 4.0) * 0.5 + 0.5);
            }`
          }
          draw={(self, gl, { time, props }) => {
            const CYCLE = 2
            if ((time * CYCLE) % 1 < 1 / 20) {
              props.size = Math.random() * 100
              props.rotationJitter = Math.random()
              props.sizeJitter = Math.random() * 2
              props.positionJitter = Math.random() * 2
              props.jitterBias = Math.random()
            }
            self.draw({
              resolution: [gl.drawingBufferWidth, gl.drawingBufferHeight],
              size: 60 * devicePixelRatio,
              count,
              time: (time * CYCLE) % 1,
              rotationJitter: props.rotationJitter,
              sizeJitter: props.sizeJitter,
              positionJitter: props.positionJitter,
              jitterBias: props.jitterBias
            })
          }}
        />
      </CanvasGL>
    </Reactive>
  )
}
