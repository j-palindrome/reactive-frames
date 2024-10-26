import { Vector2 } from 'three'
import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import { range } from 'lodash'
import { useKeyframes } from '../../src/asemic/drawingSystem/useKeyframes'
import { groupArrayBy } from '../../util/src/three'
import { rotate2d } from '../../util/src/shaders/manipulation'
import { Keyframes } from '../../src/asemic/drawingSystem/Keyframes'
import { log } from 'mathjs'

export default function ParticlesTest() {
  const kf = new Keyframes([g => g.letter('a').debug()])
  const keyframeInfo = useKeyframes(kf, {
    alpha: 1
  })
  kf.debug()

  return (
    <Reactive progress={t => (t / 2) % 1}>
      <Asemic name='a'>
        <Brush name='b' {...keyframeInfo} size={[1, 1]} loop />
      </Asemic>
      <Canvas2D
        name='c'
        className='absolute top-0 left-0'
        draw={c => {
          // c.clearRect(0, 0, c.canvas.width, c.canvas.height)
          // c.fillStyle = 'red'
          // c.strokeStyle = 'red'
          // c.lineWidth = 10
          // for (let i = 0; i < kf.keyframes[0].groups[0][0].length; i++) {
          //   const thisCurve = kf.keyframes[0].groups[0][0][i].position
          //   c.beginPath()
          //   c.arc(
          //     thisCurve.x * window.innerWidth * 2,
          //     window.innerHeight * 2 - thisCurve.y * window.innerHeight * 2,
          //     10,
          //     0,
          //     Math.PI * 2
          //   )
          //   c.fill()
          // }
        }}></Canvas2D>
    </Reactive>
  )
}
