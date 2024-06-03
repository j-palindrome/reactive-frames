import { range } from 'lodash'
import Reactive, { CanvasGL } from '../../src'
import * as twgl from 'twgl.js'
import {
  Mesh,
  PingPongBuffer,
  Plane,
  VideoPlane
} from '../../src/frames/CanvasGL'
import { cubicBezier } from '../../src/utilities/shaders'
import { wrapAt1 } from '@/util/src/shaders/manipulation'

export default function Waves() {
  const instances = 1000
  return (
    <Reactive className='h-screen w-screen'>
      <CanvasGL name='waves'>
        <PingPongBuffer
          name='particleSystem'
          height={instances}
          width={4}
          options={gl => ({
            min: gl.NEAREST,
            mag: gl.NEAREST
          })}
          startData={range(instances).flatMap(() =>
            range(4).flatMap(() =>
              [Math.random(), Math.random(), Math.random(), 1].map(x => x * 255)
            )
          )}>
          <Plane
            name='evolve'
            fragmentShader={
              /*glsl*/ `
              uniform sampler2D prevBuffer;
              ${wrapAt1}
              void main() {
                fragColor = vec4(wrapAt1(texture(prevBuffer, uv) + 1.0 / 255.0).xy, 1, 1);
              }
              `
            }
            draw={(self, gl, { elements }) => {
              self.draw({
                prevBuffer: elements.particleSystem.output
              })
            }}
          />
        </PingPongBuffer>
        {/* <VideoPlane
          name='render'
          draw={(self, gl, { elements }) => {
            twgl.bindFramebufferInfo(gl, null)
            self.draw({
              source: elements.particleSystem.output
            })
          }}
        /> */}

        <Mesh
          name='curves'
          drawMode='line strip'
          instanceCount={instances}
          attributes={{
            index: {
              numComponents: 1,
              data: range(100)
            }
          }}
          vertexShader={
            /*glsl*/ `
            in float index;
            uniform float size;
            uniform float instances;
            uniform sampler2D curves;

            ${cubicBezier}

            void main() {
              float y = float(gl_InstanceID) / instances;
              vec2 point1 = texture(curves, vec2(0, y)).xy;
              vec2 point2 = texture(curves, vec2(1.0 / 4.0, y)).xy;
              vec2 point3 = texture(curves, vec2(2.0 / 4.0, y)).xy;
              vec2 point4 = texture(curves, vec2(3.0 / 4.0, y)).xy;

              gl_Position = vec4(cubicBezier(index / size, point1, point2, point3, point4) * 2.0 - 1.0, 0, 1);
              gl_PointSize = 10.0;
            }
            `
          }
          fragmentShader={
            /*glsl*/ `
            precision highp float;
            void main() {
              fragColor = vec4(1, 1, 1, 0.3);
            }
            `
          }
          draw={(self, gl, { elements }) => {
            elements.particleSystem.unbind()
            self.draw({
              size: 100,
              curves: elements.particleSystem.output,
              instances
            })
          }}
        />
      </CanvasGL>
    </Reactive>
  )
}
