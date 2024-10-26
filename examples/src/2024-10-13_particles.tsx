import { Vector2 } from 'three'
import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import { range } from 'lodash'
import { useKeyframes } from '../../src/asemic/drawingSystem/useKeyframes'
import { groupArrayBy } from '../../util/src/three'
import { rotate2d } from '../../util/src/shaders/manipulation'
import { Keyframes } from '../../src/asemic/drawingSystem/Keyframes'

export default function ParticlesTest() {
  const kf = new Keyframes([1, 3], 5)
    .addFrame(0, 2)
    .targetFrame(0, 2)
    .targetGroup(0)
    .eachPoint(p => {
      p.position.random().multiplyScalar(0.5)
    })
    .targetGroup(1)
    .eachPoint(p => {
      p.position.random().multiplyScalar(0.5).add({ x: 0.5, y: 0.5 })
    })
    .debug()
  const keyframeInfo = useKeyframes(kf, {
    alpha: 1
  })

  return (
    <Reactive progress={t => (t / 2) % 1}>
      <Asemic name='a'>
        <Brush name='b' {...keyframeInfo} size={[1, 1]} loop />
      </Asemic>
    </Reactive>
  )
}
