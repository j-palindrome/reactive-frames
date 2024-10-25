import { Vector2 } from 'three'
import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import { range } from 'lodash'
import { Keyframes, useKeyframes } from '../../src/asemic/useKeyframes'
import { groupArrayBy } from '../../util/src/three'

export default function ParticlesTest() {
  const keyframeInfo = useKeyframes({
    keyframes: new Keyframes(200, 5)
      .eachPoint(p => p.position.randomize().addScalar(0.5))
      .copy(0, 2)
      .target(1)
      .eachPoint(point => point.position.randomize()).keyframes,
    alpha: 0.1
  })
  return (
    <Reactive progress={t => (t / 2) % 1}>
      <Asemic name='a'>
        <Brush name='b' {...keyframeInfo} size={[1, 1]} />
      </Asemic>
    </Reactive>
  )
}
