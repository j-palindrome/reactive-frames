import Reactive, { CanvasGL } from '../../src'
import { Mesh, PingPongBuffer, Plane } from '../../src/frames/CanvasGL'

export default function Waves() {
  return (
    <Reactive className='h-screen w-screen'>
      <CanvasGL name='waves'>
        <PingPongBuffer name='particleSystem'>
          <Plane
            name='evolve'
            fragmentShader={
              /*glsl*/ `
              uniform sampler2D prevBuffer;
              void main() {
                fragColor = vec4(1, 1, 1, 1);
              }
              `
            }
          />
        </PingPongBuffer>
        {/* <Mesh
          name='curves'
          attributes={{
            position: {
              numComponents: 2,
              data: []
            }
          }}
          vertexShader={
            glsl `
            `
          }
          fragmentShader={
            glsl `
            `
          }
        /> */}
      </CanvasGL>
    </Reactive>
  )
}
