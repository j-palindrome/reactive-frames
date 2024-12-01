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
    g.eval(() => {
      g.newGroup().eval(
        () =>
          g
            .newCurve(
              g.getRandomAlong(
                [0, 0, { scale: 0.6, translate: [0.2, 0.2] }],
                [1, 0]
              ),
              g.getRandomAlong([0, 1], [1, 1])
            )
            .reset(),
        100
      )
    }, 10)
  )

  return (
    <Reactive progress={t => (t * 20) % 1}>
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
