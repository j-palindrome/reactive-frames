import { arc, arcTangent } from '../util/src/geometry/geometry'
import { wrapAt1 } from '../util/src/shaders/manipulation'
import { PI } from '../util/src/shaders/utilities'
import range from 'lodash/range'
import Reactive, { AudioCtx, CanvasGL } from '../../src'
import { FFT, MicInput } from '../../src/frames/AudioCtx'
import {
  Mesh,
  PingPongBuffer,
  Plane,
  Texture,
  VideoPlane
} from '../../src/frames/CanvasGL'
import { generateShape } from '../../src/utilities/layer'
import { rotate2d } from '../../src/utilities/shaders'
import * as twgl from 'twgl.js'

const count = 1000

export default function Sines() {
  const circleSize = 100
  const instances = 750
  return (
    <Reactive className='h-screen w-screen'>
      <CanvasGL
        name='canvas'
        // setup={
        // async (self, { props }) =>
        // await new Promise<true>(res => {
        //   const loader = new FontLoader()

        // loader.load(helvetiker, function (font) {
        //   const geometry = new TextGeometry('Hello three.js!', {
        //     font: font,
        //     size: 200,
        //     depth: 0,
        //     curveSegments: 3,
        //     bevelEnabled: true,
        //     bevelThickness: 1,
        //     bevelSize: 8,
        //     bevelOffset: 0,
        //     bevelSegments: 5
        //   })
        //   geometry.computeBoundingBox()
        //   const size = new Vector3()
        //   geometry.boundingBox!.getSize(size)
        //   props.geometry = geometry
        //   props.width = size.x
        //   res(true)
        // })
        // })
        // }
      >
        <Texture
          name='fftTex'
          width={1024}
          height={1}
          draw={(self, gl, { elements }) => {
            const intData = elements.fft.intData

            twgl.setTextureFromArray(
              gl,
              self,
              [...intData].flatMap(x => [x, 255, 255, 255]),
              // intData,
              {
                width: 1024,
                height: 1
                // type: gl.UNSIGNED_BYTE,
                // format: gl.RED,
                // internalFormat: gl.R8
              }
            )
          }}
        />
        <Mesh
          name='letter'
          instanceCount={100 * circleSize}
          attributes={{
            progress: {
              numComponents: 1,
              // data: range(count).map(x => x / count)
              data: range(100 * circleSize).map(x => x / (100 * circleSize)),
              divisor: 1
            },
            position: {
              numComponents: 2,
              // data: range(count).flatMap(x => arc(rad(x / count), [0, 0], 0.3))
              // data: geometry.getAttribute('position').array
              data: range(100).flatMap(i => {
                const x = i % 10
                const y = Math.floor(i / 10)
                return range(circleSize).flatMap(i =>
                  arc(
                    (i / circleSize) * Math.PI * 2,
                    [x / 10 + 1 / 20, y / 10 + 1 / 20],
                    1 / 20 - 0.02
                  )
                )
              }),
              divisor: 1
            },
            normal: {
              numComponents: 2,
              // data: range(count).flatMap(x => arc(rad(x / count), [0, 0], 0.3))
              // data: geometry.getAttribute('position').array
              data: range(100).flatMap(i => {
                return range(circleSize).flatMap(i =>
                  arcTangent((i / circleSize) * Math.PI * 2, 1 / 20 / 0.02)
                )
              }),
              divisor: 1
            },
            point: {
              numComponents: 2,
              data: generateShape('square')
            }
          }}
          vertexShader={
            /* glsl */ `
            in vec2 normal;
            in vec2 position;
            in float progress;
            in float point;

            uniform vec2 resolution;
            uniform sampler2D fftTex;
            uniform float width;
            uniform float magnitude;

            out float vProgress;

            ${PI}
            ${rotate2d}

            void main() {
              gl_Position = vec4(
                point 
                + (position * 2. - 1.)
                + normalize(rotate2d(normal, 0.5 * PI)) 
                * pow(texture(fftTex, vec2(progress, 0)).x, 2.) 
                * magnitude,
                0, 1
              );
              // gl_Position = vec4(position * 2. - 1., 0, 1);
              vProgress = progress;
              gl_PointSize = 2.0;
            }`
          }
          fragmentShader={
            /* glsl */ `
            uniform sampler2D fftTex;
            in float vProgress;
            void main() {
              fragColor = vec4(1, 1, 1, 1);
            }`
          }
          draw={(self, gl, { elements: { fftTex, buffer1 }, props }) => {
            twgl.bindFramebufferInfo(gl, buffer1)
            const { geometry, width } = props
            // if (!geometry) return
            gl.clear(gl.COLOR_BUFFER_BIT)

            self.draw({
              fftTex,
              resolution: [gl.drawingBufferWidth, gl.drawingBufferHeight],
              width,
              magnitude: 0.4
            })
          }}
        />
        {/* <Mesh
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
            glsl `
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
            glsl `
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
        /> */}

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
          vertexShader={glsl`
            in float index;
            uniform float size;
            uniform float instances;
            uniform sampler2D curves;
            out float v_progress;

            ${PI}
            ${cubicBezier}
            ${arcShader}

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
            }
            `}
          fragmentShader={glsl`
            precision highp float;
            in float v_progress;
            void main() {
              fragColor = vec4(1, 1, 1, 0.5 * (1.0 - v_progress));
            }
            `}
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
      <AudioCtx name='audio'>
        <MicInput name='input' />
        <FFT
          name='fft'
          setup={(self, ctx, { elements }) => {
            elements.input.gain.connect(self.node)
          }}
          draw={({ node: self, floatData, intData }) => {
            self.getByteTimeDomainData(intData)
          }}
        />
      </AudioCtx>
    </Reactive>
  )
}
