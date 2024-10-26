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
  const kf = new Keyframes([
    g =>
      g
        .addCurve()
        .moveTo([0.75, 0.75])
        .warp(-0.35, [0.5, 0.8])
        .arc(0.8)
        .addCurve()
        .moveToPoint(0, 0)
        .move(-0.25, 0.5)
        .warp(0, [0.5, 0.1])
        .curve()
  ])
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
