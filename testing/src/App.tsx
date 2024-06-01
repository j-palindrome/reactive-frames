import range from 'lodash/range'
import { Mesh } from '../../src/frames/CanvasGL'
import Reactive, { Call, CanvasGL } from '../../src/index'
import { useEventListener } from '../../src/utilities/react'

function App() {
  const width = 20

  return (
    <>
      <Reactive className='h-screen w-screen'>
        <CanvasGL name='testing'>
          <Mesh
            name='points'
            drawMode='triangle fan'
            attributes={{
              position: {
                numComponents: 2,
                data: [0, 0, 1, -0.33, -1, 0.33, 0, 1, 1, 0.33, 1, -0.33, 0, -1]
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
              uniform float width;
              void main() {
                float row = floor(index / width);
                vec2 gridCoord = (vec2(mod(index, width), row) + 0.5) / width;
                if (mod(row, 2.0) == 0.0) {
                  gridCoord.x += 0.5 / width;
                }
                gl_Position = vec4(gridCoord * 2.0 - 1.0, 0, 1);
                gl_PointSize = 15.0;
              }`
            }
            fragmentShader={
              /*glsl*/ `
              const vec2 s = vec2(1, 1.7320508);
              float hex(vec2 p) {
                return max(dot(p, s*.5), p.y);
              }
              void main() {
                // if (hex(gl_PointCoord) < 0) discard;
                fragColor = vec4(1, 1, 1, hex(gl_PointCoord));
              }`
            }
            draw={self => {
              self.draw({
                width
              })
            }}
          />
        </CanvasGL>
      </Reactive>
    </>
  )
}

export default App
