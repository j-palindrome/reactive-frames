import { Vector2 } from 'three'
import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import { range } from 'lodash'
import { Keyframes, useKeyframes } from '../../src/asemic/useKeyframes'
import { groupArrayBy } from '../../util/src/three'
import { rotate2d } from '../../util/src/shaders/manipulation'

export default function ParticlesTest() {
  const keyframeInfo = useKeyframes({
    keyframes: new Keyframes(1, 5)
      .add(0, 2)
      .target(0, 2)
      .eachPoint(p => {
        p.position.randomize().addScalar(0.5)
        p.strength = Math.random()
      }).keyframes,
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
