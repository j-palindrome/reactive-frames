import { cloneDeep } from 'lodash'
import { Canvas2D, Reactive } from '../../src'
import Asemic from '../../src/asemic/Asemic'
import Brush from '../../src/asemic/Brush'
import Builder from '../../src/asemic/drawingSystem/Builder'
import { QuadraticBezierCurve, Vector2 } from 'three'

export default function ParticlesTest() {
  // abcdefghijklmnopqrstuvwxyz
  // a poem in space
  const kf = new Builder(g =>
    g.newGroup().eval(() => {
      g.newCurve(
        g.getRandomAlong([0, 0], [1, 0]),
        g.getRandomAlong([0, 1], [1, 1])
      )
    }, 1000)
  )

  return (
    <Reactive progress={t => t % 1}>
      <Asemic name='a'>
        <Brush
          keyframes={kf}
          name='b'
          defaults={{
            a: 1,
            size: [1, 1]
          }}
          recalculate
        />
      </Asemic>
    </Reactive>
  )
}
