import range from 'lodash/range'
import { Mesh } from '../../src/frames/CanvasGL'
import Reactive, { Call, CanvasGL } from '../../src/index'
import { useEventListener } from '../../src/utilities/react'
import { useRef } from 'react'
import { flipY } from '../util/src/shaders/manipulation'
import { rotate2d } from '../../src/utilities/shaders'
import { PI } from '../util/src/shaders/utilities'

function App() {
  const width = 80

  const mousePos = useRef([0, 0])
  useEventListener(
    'mousemove',
    ev => {
      mousePos.current = [
        ev.clientX / window.innerWidth,
        1 - ev.clientY / window.innerHeight
      ]
    },
    []
  )

  return (
    <>
      <Reactive className='h-screen w-screen'>
        <CanvasGL
          name='testing'
          setup={gl => {
            gl.clearColor(1, 1, 1, 1)
          }}>
          <Mesh
            name='points'
            instanceCount={width * width}
            attributes={{
              position: {
                numComponents: 2,
                data: [
                  0, 0, -1, -0.33, -1, 0.33, 0, 1, 1, 0.33, 1, -0.33, 0, -1, -1,
                  -0.33
                ]
              },
              indices: [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 6, 0, 6, 1],
              mult: {
                numComponents: 4,
                divisor: 1,
                data: range(width * width).flatMap(x => [
                  Math.random(),
                  Math.random(),
                  Math.random(),
                  Math.random()
                ])
              },
              index: {
                numComponents: 1,
                data: range(width * width),
                divisor: 1
              }
            }}
            vertexShader={
              /*glsl*/ `
              in float index;
              in vec2 position;
              in vec4 mult;
              uniform float width;
              out vec2 uv;
              out vec4 vMult;

              ${rotate2d}
              ${PI}

              void main() {
                float row = floor(index / width);
                vec2 gridCoord = (vec2(mod(index, width), row) + 0.5) / width;
                if (mod(row, 2.0) == 0.0) {
                  gridCoord.x -= 0.5 / width;
                }
                // gl_Position = vec4(gridCoord * 2.0 - 1.0, 0, 1);
                // gl_PointSize = 15.0;
                vMult = mult;
                uv = position * 0.5 + 0.5;
                gl_Position = vec4((rotate2d(position, mult.x * 0.35) / (width * 2.0) + gridCoord) * 2.0 - 1.0, 0, 1);
              }
              `
            }
            fragmentShader={
              /*glsl*/ `
              in vec2 uv;
              uniform vec2 resolution;
              uniform vec3 color0;
              uniform vec3 color1;
              uniform vec3 color2;
              uniform vec3 color3;
              uniform vec2 mousePos;
              in vec4 vMult;
              vec3 computeStrength(vec3 color, vec2 location, vec2 fragMap) {
                return color * (1.25 - distance(fract(location), fragMap));
              }
              ${flipY}
              void main() {
                vec2 fragMap = gl_FragCoord.xy / resolution;
                // if (hex(gl_PointCoord) < 0) discard;
                vec2 mouseCoords = mousePos;
                vec3 color0Strength = computeStrength(color0, vec2(0, 0) + mousePos * vMult.x, fragMap);
                vec3 color1Strength = computeStrength(color1, vec2(1, 0) + mousePos * vMult.y, fragMap);
                vec3 color2Strength = computeStrength(color2, vec2(1, 1) + mousePos * vMult.z, fragMap);
                vec3 color3Strength = computeStrength(color3, vec2(0, 1) + mousePos * vMult.w, fragMap);

                fragColor = vec4((color0Strength + color1Strength + color2Strength + color3Strength) / 3.0, 1);
              }`
            }
            draw={(self, gl) => {
              gl.clear(gl.COLOR_BUFFER_BIT)
              const colors = [
                [201, 129, 198],
                [79, 54, 122],
                [47, 156, 181],
                [193, 159, 194]
              ].map(x => x.map(x => x / 255))

              self.draw({
                width,
                color0: colors[0],
                color1: colors[1],
                color2: colors[2],
                color3: colors[3],
                mousePos: mousePos.current,
                resolution: [gl.drawingBufferWidth, gl.drawingBufferHeight]
              })
            }}
          />
        </CanvasGL>
      </Reactive>
    </>
  )
}

export default App
