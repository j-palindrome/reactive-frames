import {
  Mesh,
  PingPongBuffer,
  Plane,
  VideoPlane
} from '../../src/frames/CanvasGL'
import Reactive, { CanvasGL, compileFragmentShader } from '../../src/index'
import * as twgl from 'twgl.js'

function App() {
  const width = 20
  return (
    <>
      <Reactive className='h-screen w-screen'>
        <CanvasGL name='testing' height={width} width={width} noResize>
          <PingPongBuffer
            width={width}
            height={width}
            name='pingPong'
            setup={(self, gl) => {
              twgl.setTextureFromArray(
                gl,
                self.input.attachments[0],
                new Uint8Array(width * width * 4).map(x => Math.random() * 255)
              )
            }}
            draw={self => self.bind()}>
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
                  // if (sampleTex.r > 0.99) {
                  //   fragColor = vec4(0, 0, 0, 1);
                  // } else {
                  //   fragColor = sampleTex + 0.01;
                  // }
                  fragColor = sampleTex;
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
