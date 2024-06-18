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
import { wrapAt1 } from '../util/src/shaders/manipulation'
import { PI } from '../util/src/shaders/utilities'
import { arc } from '../util/src/shaders/curve'

export default function Waves() {
  const instances = 750
  return (
    <Reactive className='h-screen w-screen'>
      <CanvasGL
        name='waves'
        className='h-full w-full'
        setup={gl => {
          gl.getExtension('EXT_color_buffer_float')
        }}>
        <PingPongBuffer
          name='particleSystem'
          height={instances}
          width={4}
          options={gl => ({
            type: gl.FLOAT,
            internalFormat: gl.RGBA32F,
            format: gl.RGBA,
            min: gl.NEAREST,
            mag: gl.NEAREST
          })}
          startData={range(instances).flatMap(() =>
            [
              [0.99, 0.99],
              // [Math.random(), Math.random()],
              [Math.random(), Math.random()],
              [Math.random(), Math.random()],
              // [Math.random(), Math.random()]
              [Math.random(), 1]
            ].flatMap(([x, y]) => [x, y, Math.random(), 1].map(x => x * 255))
          )}>
          <Plane
            name='evolve'
            fragmentShader={
              /* glsl */ `
              uniform sampler2D prevBuffer;
              uniform float speed;
              uniform vec2 wind1;
              uniform vec2 wind2;
              uniform vec2 wind3;
              uniform vec2 wind4;
              ${wrapAt1}


              void main() {
                vec2 windPoints[4] = vec2[4](wind1, wind2, wind3, wind4);
                int pointIndex = int(floor(uv.x * 4.0));
                vec2 windPoint = windPoints[pointIndex];
                // vec2 windPoint = wind2;
                
                // fragColor = wrapAt1(vec4(texture(prevBuffer, uv).xy + windPoint, 1, 1));
                fragColor = vec4(wrapAt1(vec3(texture(prevBuffer, uv).xy + windPoint / 255.0, 1)), 1);
                // fragColor = vec4(windPoint, 0, 1);
                // vec4(windPoint, 0, 0)
                // fragColor = vec4((texture(prevBuffer, uv) + float(pointIndex) - (1.0 / 255.0)).xy, 1, 1);
                // fragColor = vec4((texture(prevBuffer, uv) + float(pointIndex) - (1.0 / 255.0)).xy, 1, 1);
              }
              `
            }
            draw={(self, gl, { elements }) => {
              self.draw({
                prevBuffer: elements.particleSystem.output,
                speed: 255 / 255,
                wind1: [0, 0],
                wind2: [0.035, 0.837],
                wind3: [0.254, 0.892],
                wind4: [-1, 0.5]
              })
            }}
          />
        </PingPongBuffer>
        <VideoPlane
          name='render'
          draw={(self, gl, { elements }) => {
            return
            twgl.bindFramebufferInfo(gl, null)
            self.draw({
              source: elements.particleSystem.output
            })
          }}
        />

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
            out float v_progress;
            ${PI}
            ${cubicBezier}
            ${arc}

            void main() {
              float y = float(gl_InstanceID) / instances;
              vec2 point1 = texture(curves, vec2(0, y)).xy;
              vec2 point2 = texture(curves, vec2(1.0 / 4.0, y)).xy;
              vec2 point3 = texture(curves, vec2(2.0 / 4.0, y)).xy;
              float progress = ((1.0 - texture(curves, vec2(3.0 / 4.0, y)).x));
              float circleProgress = (progress * 0.25 + 0.5) * PI * 2.0;
              vec2 point4 = arc(circleProgress, vec2(1, 1), ((sin(circleProgress * PI) * 0.5 + 0.5) * 0.75 + 0.75) * 0.66);

              gl_Position = vec4(cubicBezier(index / size, point1, point2, point3, point4) * 2.0 - 1.0, 0, 1);
              gl_PointSize = 10.0;
              v_progress = progress;
            }`
          }
          fragmentShader={
            /*glsl*/ `
            precision highp float;
            in float v_progress;
            void main() {
              fragColor = vec4(1, 1, 1, 0.5 * (1.0 - v_progress));
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
