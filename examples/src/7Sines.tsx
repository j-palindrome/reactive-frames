import {
  PI,
  defaultFragColor,
  defaultVert2D,
  hash
} from '../util/src/shaders/utilities'
import Reactive, { AudioCtx, CanvasGL } from '../../src'
import {
  Mesh,
  PingPongBuffer,
  Plane,
  Texture,
  VideoPlane
} from '../../src/frames/CanvasGL'
import { range } from 'lodash'
import { arc, arcTangent } from '../util/src/geometry/geometry'
import { rad, rotate2d, wrapAt1 } from '../util/src/shaders/manipulation'
import { rad as radFunc } from '../util/src/math'
import { generateShape } from '../../src/utilities/layer'
import * as twgl from 'twgl.js'
import { shape, toAngle } from '../util/src/geometry/geometry'
import { cubicBezier } from '../../src/utilities/shaders'
import { FFT, MicInput } from '../../src/frames/AudioCtx'
import { arc as arcShader } from '../util/src/shaders/curve'
import { useMemo, useRef } from 'react'
import { luma } from '../util/src/shaders/color'

export default function App() {
  const count = 500
  const lineCount = 100
  const centerX = 0
  const centerY = 0

  const startData = useRef(
    (() => {
      return range(lineCount).flatMap(() =>
        [
          [centerX, centerY],
          [Math.random(), Math.random()],
          [Math.random(), Math.random()],
          [Math.random(), 1]
        ].flatMap(([x, y]) => [x, y, Math.random(), 1].map(x => x * 255))
      )
    })()
  )

  return (
    <Reactive className='h-screen w-screen'>
      <CanvasGL
        name='canvas'
        draw={(self, { props }) => {
          props.rotationJitter = 0.3
          props.sizeJitter = 0.2
          props.positionJitter = 1
          props.jitterBias = 1
          props.opacity = 0.05
          props.speeds = [0, -1.5, -0.9, 0.7]
          props.speedMultiplier = 0.1
          props.gravity = [0.5, 0.5]
          props.gravStrength = -0
          props.repulsion = 1
        }}>
        <PingPongBuffer
          name='particleSystem'
          height={lineCount}
          width={4}
          options={gl => ({
            type: gl.FLOAT,
            internalFormat: gl.RGBA32F,
            format: gl.RGBA,
            min: gl.NEAREST,
            mag: gl.NEAREST
          })}
          startData={startData.current}>
          <Plane
            name='evolve'
            fragmentShader={
              /* glsl */ `
              uniform sampler2D prevBuffer;
              uniform vec4 speeds;
              uniform vec2 wind1;
              uniform vec2 wind2;
              uniform vec2 wind3;
              uniform vec2 wind4;
              uniform float time;
              uniform float lineCount;
              uniform vec2 gravity;
              uniform float gravStrength;
              uniform float repulsion;
              uniform float speedMultiplier;

              uniform sampler2D feedback;

              ${wrapAt1}
              ${rad}
              ${rotate2d}
              ${hash}
              ${luma}

              vec2 gravitate(vec2 pos, vec2 gravity, float gravStrength) {
                vec2 gravVector = pos - gravity;
                float vectorStrength = 1.0 - length(gravVector);
                return pos - (gravVector * vectorStrength * gravStrength);
              }

              vec2 repulse(vec2 lineCurrent) {
                float onePixelY = 1. / lineCount;
                vec2 lineAbove = texture(prevBuffer, wrapAt1(vec2(uv.x, uv.y - onePixelY * 2.))).xy;
                return lineCurrent + lineAbove * repulsion;
              }

              void main() {
                vec2 windPoints[4] = vec2[4](wind1, wind2, wind3, wind4);
                // find the index within the main fragment
                int pointIndex = int(floor(uv.x * 4.0));
                int lineIndex = int(mod(floor(uv.y * lineCount), 4.0));

                vec2 windPoint = windPoints[pointIndex];

                // wrap around a circle
                vec4 tex = texture(prevBuffer, uv);
                // this is each value in the grid
                vec2 pos = tex.xy;
                // sample the luma of positions from drawn texture
                float lumaSpeed = texture(feedback, pos).r;

                pos = repulse(pos);
                pos = gravitate(pos, gravity, gravStrength);
                vec2 rotation = rotate2d(pos - 0.5, speeds[lineIndex] * speedMultiplier) + 0.5;
                fragColor = vec4(rotation, 1, 1);
              }
              `
            }
            draw={(self, gl, { elements, time, props }) => {
              self.draw({
                prevBuffer: elements.particleSystem.output,
                speeds: props.speeds,
                lineCount,
                wind1: [centerX, centerY],
                wind2: [0.035, 0.837],
                wind3: [0.254, 0.892],
                wind4: [-1, 0.5],
                gravity: props.gravity,
                gravStrength: props.gravStrength,
                time,
                speedMultiplier: props.speedMultiplier,
                feedback: elements.feedback
              })
            }}
          />
        </PingPongBuffer>
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
        {/* <VideoPlane
          name='plane'
          draw={(self, gl, { elements }) => {
            twgl.bindFramebufferInfo(gl, null)
            self.draw({ source: elements.particleSystem.output })
          }}
        /> */}
        <Mesh
          name='mesh'
          instanceCount={count * lineCount}
          attributes={{
            // get the same uv coordinates for all y
            bezierUv: {
              numComponents: 2,
              data: range(lineCount).flatMap(y =>
                range(count).flatMap(x => [x / count, y / lineCount])
              ),
              divisor: 1 // repeats every point
              // data: [0, 0]
            },
            rotation: {
              numComponents: 1,
              data: range(lineCount).flatMap(() =>
                range(count).flatMap(x =>
                  toAngle(arcTangent(radFunc(x / count / 2 + 0.75), [0.8, 1.8]))
                )
              ),
              divisor: 1
            },
            vertex: {
              numComponents: 2,
              data: generateShape('squareCenter')
            },
            fftUv: {
              numComponents: 2,
              data: range(lineCount).flatMap(y =>
                range(count).flatMap(x => [x / count, 0])
              ),
              divisor: 1
            },
            ...twgl.primitives.createXYQuadVertices(1)
          }}
          vertexShader={
            /*glsl*/ `
            in vec2 bezierUv;
            in float rotation;
            in vec3 position;
            in vec2 heading;
            in vec2 vertex;
            in vec2 texcoord;
            in vec2 fftUv;
            
            uniform sampler2D feedback;
            uniform sampler2D fftTex;
            uniform sampler2D bezierTex;

            out vec2 uv;
            out float instance;

            uniform float size;
            uniform vec2 resolution;
            uniform float jitterBias;
            uniform float rotationJitter;
            uniform float positionJitter;
            uniform float sizeJitter;
            uniform float amount;

            out float test;

            ${hash}
            ${rotate2d}
            ${PI}
            ${cubicBezier}
            ${arcShader}
            ${luma}

            vec2 bezierPoint() {
              float y = bezierUv.y;
              test = y;
              vec2 point1 = texture(bezierTex, vec2(0, y)).xy;
              vec2 point2 = texture(bezierTex, vec2(1.0 / 4.0, y)).xy;
              vec2 point3 = texture(bezierTex, vec2(2.0 / 4.0, y)).xy;
              float progress = ((1.0 - texture(bezierTex, vec2(3.0 / 4.0, y)).x));
              float circleProgress = (progress * 0.25 + 0.5) * PI * 2.0;
              vec2 point4 = arc(circleProgress, vec2(1, 1), ((sin(circleProgress * PI) * 0.5 + 0.5) * 0.75 + 0.75) * 0.66);
              
              return cubicBezier(bezierUv.x, point1, point2, point3, point4) * 2.0 - 1.0;
            }

            void main() {
              instance = float(gl_InstanceID);

              float fft = texture(fftTex, fftUv).x;
              float pointSize = size / resolution.x;
              vec2 points = bezierPoint();
              float randomSeed = bezierUv.y + bezierUv.x;
              float jitterHash = hash(randomSeed);
              float jitterSign = hash(randomSeed + 3.1432);

              vec4 feedbackTex = texture(feedback, position.xy);
              float feedbackLuma = luma(feedbackTex);

              if (jitterSign > 0.5) jitterSign = 1.0;
              else jitterSign = -1.0;

              gl_Position = vec4(
                // base position
                position.xy 
                  * (pointSize + (hash(randomSeed + 0.8241) - 0.5) * sizeJitter * pointSize) 
                // jitter
                + vec2(pow(jitterHash, (1.0 + jitterBias)) * jitterSign) * (positionJitter * pointSize) * fft * amount
                // rotation amount
                // rotation * feedbackLuma + (hash(randomSeed + 1.2341) - 0.5) * rotationJitter * PI
                + points, 0, 1
              );

              uv = texcoord;
            }`
          }
          fragmentShader={
            /*glsl*/ `
            in vec2 uv;
            in float instance;
            uniform float time;
            uniform float count;
            uniform float opacity;
            in float test;

            ${PI}
            ${rad}

            void main() {
              float func2 = sin(rad(uv.x) * 9.0);
              float func1 = sin(rad(uv.x + 0.43) * 11.0) * sin(rad(uv.x));

              if (func1 > 0.0 && func2 > 0.0) discard;
              else fragColor = vec4(1, 1, 1, (func1 + func2) * opacity);
            }`
          }
          draw={(self, gl, { time, props, elements }) => {
            const CYCLE = 2
            const amount = 10
            elements.particleSystem.unbind()
            self.draw({
              resolution: [gl.drawingBufferWidth, gl.drawingBufferHeight],
              size: 60 * devicePixelRatio,
              count,
              time: (time * CYCLE) % 1,
              rotationJitter: props.rotationJitter,
              sizeJitter: props.sizeJitter,
              positionJitter: props.positionJitter,
              jitterBias: props.jitterBias,
              amount,
              bezierTex: elements.particleSystem.output,
              opacity: props.opacity,
              feedback: elements.feedback
            })
          }}
        />
        <Texture
          name='feedback'
          width={1080}
          height={1080}
          draw={(self, gl) => {
            // gl.activeTexture(gl.TEXTURE0)
            gl.bindTexture(gl.TEXTURE_2D, self)
            gl.copyTexImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA,
              0,
              0,
              gl.drawingBufferWidth,
              gl.drawingBufferHeight,
              0
            )
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
