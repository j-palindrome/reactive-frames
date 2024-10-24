import { Vector2 } from 'three'
import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import Keyframes from '../../src/asemic/Keyframes'
import { range } from 'lodash'
import { useKeyframes } from '../../src/asemic/useKeyframes'
import { groupArrayBy } from '../../util/src/three'

export default function ParticlesTest() {
  const points = range(5).map(() => new Vector2().random().toArray())
  const keyframeInfo = useKeyframes({
    keyframes: new Keyframes(2000, 5)
      .set(points)
      .eachPoint(point => point.position.multiplyScalar(2))
      .copy(0)
      .target(0)
      .eachPoint(point => point.position.multiplyScalar(point.curveProgress))
      .target(1)
      .eachPoint(point =>
        point.position.multiplyScalar(1 - point.curveProgress)
      )
      .interpolate(0)
      .target(1)
      .eachCurve(x => x.reverse())
      .interpolate(1)
      .eachCurve(x => x.reverse())
      .target(0, -1)
      .eachPoint(p => p.position.randomize([0, 1])).keyframes,
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
