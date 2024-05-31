import {
  Mesh,
  PingPongBuffer,
  Plane,
  VideoPlane
} from '../../src/frames/CanvasGL'
import Reactive, { CanvasGL, compileFragmentShader } from '../../src/index'
import * as twgl from 'twgl.js'

// console.log(
//   compileFragmentShader(generator => generator.noise().rotate(Math.PI))
// )

function App() {
  return (
    <>
      <Reactive className='h-screen w-screen'>
        <CanvasGL name='testing'>
          <PingPongBuffer name='pingPong' draw={self => self.bind()}>
            <Plane
              name='render'
              fragmentShader={
                /*glsl*/ `
                uniform sampler2D prevBuffer;
                void main() {
                  // if (texture(prevBuffer, uv).r == 0.0) {
                  //   fragColor = vec4(1, 0, 0, 1);
                  // } else {
                  //   fragColor = vec4(0, 1, 1, 1);
                  // }
                  vec4 sampleTex = texture(prevBuffer, uv);
                  if (sampleTex.r > 0.99) {
                    fragColor = vec4(0, 0, 0, 1);
                  } else {
                    fragColor = sampleTex + 0.05;
                  }
                  // fragColor = vec4(0.2, 0.2, 0.2, 0.2) - texture(prevBuffer, uv);
                  // fragColor = vec4(1, 1, 1, 1);
                }`
              }
              draw={(self, gl, { elements }) => {
                self.draw({
                  prevBuffer: elements.pingPong.output
                })
              }}
            />
          </PingPongBuffer>
          <VideoPlane
            name='plane'
            draw={(self, gl, { elements }) => {
              elements.pingPong.unbind()
              self.draw({ source: elements.pingPong.output })
            }}
          />
        </CanvasGL>
      </Reactive>
    </>
  )
}

export default App
